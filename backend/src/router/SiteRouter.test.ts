import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao as createMockDocDao } from "../dao/DocDao.mock";
import type { SiteDao } from "../dao/SiteDao";
import { mockSiteDao as createMockSiteDao } from "../dao/SiteDao.mock";
import type { Doc } from "../model/Doc";
import type { Site, SiteMetadata } from "../model/Site";
import { getBuildTempDir, unregisterBuildTempDir } from "../services/BuildStreamService";
import { cleanupTempDirectory } from "../util/DocGenerationUtil";
import { clearCache } from "../util/domain/SubdomainCache";
import type { TokenUtil } from "../util/TokenUtil";
import {
	bundleImagesIntoFilesImpl,
	computeHash,
	convertToFolderMetasArray,
	createSiteRouter,
	extractConfigFileHashes,
	extractFolderAndFile,
	type FolderContent,
	getGitHubOrg,
	processContentFile,
	registerJolliSiteDomain,
	validateGitHubOrgAccess,
	writeFileTreeEntry,
} from "./SiteRouter";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the config module
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		VERCEL_TOKEN: undefined,
		TOKEN_SECRET: "test-secret-key-for-jwt-signing",
	})),
}));

// Mock DocGenerationUtil
vi.mock("../util/DocGenerationUtil", () => ({
	checkDeploymentStatus: vi.fn(),
	cleanupTempDirectory: vi.fn().mockResolvedValue(undefined),
}));

// Mock BuildStreamService for temp directory operations
vi.mock("../services/BuildStreamService", () => ({
	getBuildTempDir: vi.fn().mockReturnValue(null),
	registerBuildTempDir: vi.fn(),
	unregisterBuildTempDir: vi.fn(),
	broadcastBuildEvent: vi.fn(),
	addBuildConnection: vi.fn(),
	removeBuildConnection: vi.fn(),
	sendBuildEvent: vi.fn(),
	clearEventBuffer: vi.fn(),
}));

// Mock OctokitUtil to avoid actual GitHub API calls
const mockGetTree = vi.fn();
const mockGetRepoContent = vi.fn();
vi.mock("../util/OctokitUtil", () => ({
	createOctokit: vi.fn(() => ({
		rest: {
			git: {
				getTree: mockGetTree,
			},
			repos: {
				getContent: mockGetRepoContent,
			},
		},
	})),
}));

// Mock DocsiteGitHub to avoid actual GitHub API calls
vi.mock("../github/DocsiteGitHub", () => ({
	createDocsiteGitHub: vi.fn(() => ({
		downloadRepository: vi.fn().mockResolvedValue([]),
	})),
}));

// Mock OctokitGitHub for optimized config file fetching
const mockGetContent = vi.fn();
vi.mock("../github/OctokitGitHub", () => ({
	createOctokitGitHub: vi.fn(() => ({
		getContent: mockGetContent,
	})),
}));

// Mock VercelDeployer for domain management and env var tests
const mockVercelDeployer = {
	addDomainToProject: vi.fn(),
	removeDomainFromProject: vi.fn(),
	getDomainStatus: vi.fn(),
	verifyDomain: vi.fn(),
	syncJwtAuthEnvVars: vi.fn(),
};
vi.mock("../util/VercelDeployer", () => ({
	VercelDeployer: vi.fn(() => mockVercelDeployer),
	createBuildEventHandlers: vi.fn(),
}));

// Mock DnsUtil for DNS configuration checks
const mockCheckDnsConfiguration = vi.fn();
vi.mock("../util/DnsUtil", () => ({
	checkDnsConfiguration: (...args: Array<unknown>) => mockCheckDnsConfiguration(...args),
}));

// Mock node:fs/promises for writeFileTreeEntry tests
vi.mock("node:fs/promises", () => ({
	writeFile: vi.fn(),
	mkdir: vi.fn(),
	readFile: vi.fn(),
	rm: vi.fn(),
}));

// Mock ImageBundler for bundleImagesIntoFilesImpl tests
const mockBundleSiteImages = vi.fn();
vi.mock("../util/ImageBundler", () => ({
	bundleSiteImages: (...args: Array<unknown>) => mockBundleSiteImages(...args),
}));

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("SiteRouter", () => {
	let app: Express;
	let mockSiteDao: SiteDao;
	let mockDocDaoInstance: DocDao;
	let mockTokenUtil: TokenUtil<UserInfo>;

	const mockDocsite: Site = {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		userId: 1,
		status: "active",
		visibility: "internal",
		lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
		metadata: {
			githubRepo: "Jolli-sample-repos/test-site",
			githubUrl: "https://github.com/Jolli-sample-repos/test-site",
			vercelUrl: "https://test-site.vercel.app",
			framework: "docusaurus-2",
			articleCount: 3,
			lastDeployedAt: "2024-01-15T10:00:00Z",
		},
		createdAt: new Date("2024-01-15T08:00:00Z"),
		updatedAt: new Date("2024-01-15T10:00:00Z"),
	};

	const mockDoc: Doc = {
		id: 1,
		jrn: "jrn:aws:doc:us-east-1:123456789012:doc/1",
		content: "# Test Article\n\nContent here.",
		contentType: "text/markdown",
		contentMetadata: {
			title: "Test Article",
			sourceName: "GitHub",
			sourceUrl: "https://github.com/test/repo",
		},
		createdAt: new Date("2024-01-15T09:00:00Z"),
		updatedAt: new Date("2024-01-16T12:00:00Z"),
		updatedBy: "test-user",
		source: undefined,
		sourceMetadata: undefined,
		version: 1,
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "test-user",
		deletedAt: undefined,
		explicitlyDeleted: false,
		slug: "test-article",
		path: "",
	};

	beforeEach(() => {
		mockSiteDao = createMockSiteDao();
		mockDocDaoInstance = createMockDocDao();
		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		app = express();
		app.use(express.json());
		app.use(
			"/sites",
			createSiteRouter(mockDaoProvider(mockSiteDao), mockDaoProvider(mockDocDaoInstance), mockTokenUtil),
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /", () => {
		it("should list all docsites with needsUpdate flags", async () => {
			vi.mocked(mockSiteDao.listSites).mockResolvedValue([mockDocsite]);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);

			const response = await request(app).get("/sites");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0]).toMatchObject({
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				needsUpdate: true,
			});
			expect(mockSiteDao.listSites).toHaveBeenCalled();
			expect(mockSiteDao.checkIfNeedsUpdate).toHaveBeenCalledWith(1);
		});

		it("should return empty array when no docsites exist", async () => {
			vi.mocked(mockSiteDao.listSites).mockResolvedValue([]);

			const response = await request(app).get("/sites");

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("should handle multiple docsites with different update statuses", async () => {
			const mockDocsite2: Site = {
				...mockDocsite,
				id: 2,
				name: "another-site",
			};

			vi.mocked(mockSiteDao.listSites).mockResolvedValue([mockDocsite, mockDocsite2]);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate)
				.mockResolvedValueOnce(true) // First docsite needs update
				.mockResolvedValueOnce(false); // Second docsite doesn't need update

			const response = await request(app).get("/sites");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0].needsUpdate).toBe(true);
			expect(response.body[1].needsUpdate).toBe(false);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.listSites).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list sites" });
		});
	});

	describe("GET /:id", () => {
		it("should get docsite by id with needsUpdate flag", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				needsUpdate: false,
			});
			expect(mockSiteDao.getSite).toHaveBeenCalledWith(1);
			expect(mockSiteDao.checkIfNeedsUpdate).toHaveBeenCalledWith(1);
		});

		it("should include changed articles when needsUpdate is true", async () => {
			const changedArticles = [
				{
					id: 1,
					title: "Changed Article",
					jrn: "jrn:doc:1",
					updatedAt: "2024-01-01T00:00:00Z",
					contentType: "text/markdown",
					changeType: "updated" as const,
				},
			];
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue(changedArticles);

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				id: 1,
				name: "test-site",
				needsUpdate: true,
				changedArticles,
			});
			expect(mockSiteDao.getChangedArticles).toHaveBeenCalledWith(1);
		});

		it("should check deployment status when building with VERCEL_TOKEN", async () => {
			const { getConfig } = await import("../config/Config");
			const { checkDeploymentStatus } = await import("../util/DocGenerationUtil");

			// Mock config to return VERCEL_TOKEN
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			// Mock checkDeploymentStatus to return "ready"
			vi.mocked(checkDeploymentStatus).mockResolvedValue("ready");

			const buildingDocsite: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata as object),
					deploymentStatus: "building",
					productionDeploymentId: "dpl_test123",
				} as typeof mockDocsite.metadata,
			};

			const updatedDocsite: Site = {
				...buildingDocsite,
				metadata: {
					...(buildingDocsite.metadata as object),
					deploymentStatus: "ready",
				} as typeof buildingDocsite.metadata,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(updatedDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(200);
			expect(checkDeploymentStatus).toHaveBeenCalledWith("dpl_test123", "test-token");
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						deploymentStatus: "ready",
					}),
				}),
			);
		});

		it("should not update deployment status if still building", async () => {
			const { getConfig } = await import("../config/Config");
			const { checkDeploymentStatus } = await import("../util/DocGenerationUtil");

			// Mock config to return VERCEL_TOKEN
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			// Mock checkDeploymentStatus to return "building" (no change)
			vi.mocked(checkDeploymentStatus).mockResolvedValue("building");

			const buildingDocsite: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata as object),
					deploymentStatus: "building",
					productionDeploymentId: "dpl_test123",
				} as typeof mockDocsite.metadata,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(200);
			expect(checkDeploymentStatus).toHaveBeenCalledWith("dpl_test123", "test-token");
			expect(mockSiteDao.updateSite).not.toHaveBeenCalled();
		});

		it("should skip deployment status check when no VERCEL_TOKEN", async () => {
			const { getConfig } = await import("../config/Config");
			const { checkDeploymentStatus } = await import("../util/DocGenerationUtil");

			// Mock config to return no VERCEL_TOKEN
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			const buildingDocsite: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata as object),
					deploymentStatus: "building",
					productionDeploymentId: "dpl_test123",
				} as typeof mockDocsite.metadata,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(200);
			expect(checkDeploymentStatus).not.toHaveBeenCalled();
			expect(mockSiteDao.updateSite).not.toHaveBeenCalled();
		});

		it("should return 404 when docsite not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Docsite not found" });
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).get("/sites/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
			expect(mockSiteDao.getSite).not.toHaveBeenCalled();
		});

		it("should handle negative id (valid parse, docsite not found)", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/-1");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Docsite not found" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get site" });
		});
	});

	describe("GET /:id/check-update", () => {
		it("should check if docsite needs update", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);
			vi.mocked(mockDocDaoInstance.listDocs).mockResolvedValue([mockDoc]);

			const response = await request(app).get("/sites/1/check-update");

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				needsUpdate: true,
				lastGeneratedAt: "2024-01-15T10:00:00.000Z",
			});
			expect(response.body.latestArticleUpdate).toBeDefined();
			expect(mockSiteDao.getSite).toHaveBeenCalledWith(1);
			expect(mockSiteDao.checkIfNeedsUpdate).toHaveBeenCalledWith(1);
			expect(mockDocDaoInstance.listDocs).toHaveBeenCalled();
		});

		it("should handle docsite with no articles", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockDocDaoInstance.listDocs).mockResolvedValue([]);

			const response = await request(app).get("/sites/1/check-update");

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				needsUpdate: false,
				lastGeneratedAt: "2024-01-15T10:00:00.000Z",
				latestArticleUpdate: new Date(0).toISOString(),
			});
		});

		it("should find latest article from multiple articles", async () => {
			const mockDoc2: Doc = {
				...mockDoc,
				id: 2,
				updatedAt: new Date("2024-01-17T15:00:00Z"), // Later than mockDoc
			};
			const mockDoc3: Doc = {
				...mockDoc,
				id: 3,
				updatedAt: new Date("2024-01-16T08:00:00Z"), // Earlier than mockDoc2
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);
			vi.mocked(mockDocDaoInstance.listDocs).mockResolvedValue([mockDoc, mockDoc2, mockDoc3]);

			const response = await request(app).get("/sites/1/check-update");

			expect(response.status).toBe(200);
			expect(new Date(response.body.latestArticleUpdate)).toEqual(new Date("2024-01-17T15:00:00Z"));
		});

		it("should return 404 when docsite not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/check-update");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Docsite not found" });
			expect(mockSiteDao.checkIfNeedsUpdate).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).get("/sites/invalid/check-update");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/1/check-update");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check update status" });
		});
	});

	describe("PUT /:id/articles", () => {
		it("should update site article selection with specific JRNs", async () => {
			const selectedArticleJrns = ["jrn:doc:1", "jrn:doc:2"];
			const updatedDocsite: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata as object),
					selectedArticleJrns,
				} as typeof mockDocsite.metadata,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(updatedDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).put("/sites/1/articles").send({ selectedArticleJrns });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						selectedArticleJrns,
					}),
				}),
			);
		});

		it("should clear article selection when null is provided", async () => {
			const docsiteWithSelection: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata as object),
					selectedArticleJrns: ["jrn:doc:1"],
				} as typeof mockDocsite.metadata,
			};
			const updatedDocsite: Site = {
				...mockDocsite,
				metadata: mockDocsite.metadata,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(docsiteWithSelection);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(updatedDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).put("/sites/1/articles").send({ selectedArticleJrns: null });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.not.objectContaining({
						selectedArticleJrns: expect.anything(),
					}),
				}),
			);
		});

		it("should store empty array when zero articles selected", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app).put("/sites/1/articles").send({ selectedArticleJrns: [] });

			expect(response.status).toBe(200);
			// Empty array should be stored as empty array (not cleared)
			// This distinguishes "zero articles" from "all articles" (null/undefined)
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({ selectedArticleJrns: [] }),
				}),
			);
		});

		it("should handle site with no metadata", async () => {
			const docsiteNoMetadata: Site = {
				...mockDocsite,
				metadata: null as unknown as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(docsiteNoMetadata);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(false);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue([]);

			const response = await request(app)
				.put("/sites/1/articles")
				.send({ selectedArticleJrns: ["jrn:doc:1"] });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: { selectedArticleJrns: ["jrn:doc:1"] },
				}),
			);
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).put("/sites/invalid/articles").send({ selectedArticleJrns: [] });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 400 when selectedArticleJrns is not an array or null", async () => {
			const response = await request(app).put("/sites/1/articles").send({ selectedArticleJrns: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "selectedArticleJrns must be an array or null" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).put("/sites/999/articles").send({ selectedArticleJrns: [] });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/sites/1/articles").send({ selectedArticleJrns: [] });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update site articles" });
		});

		it("should include changedArticles in response when needsUpdate is true", async () => {
			const changedArticles = [
				{
					id: 1,
					title: "Changed Article",
					jrn: "jrn:doc:1",
					updatedAt: "2024-01-01T00:00:00Z",
					contentType: "text/markdown",
					changeType: "updated" as const,
				},
			];

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.checkIfNeedsUpdate).mockResolvedValue(true);
			vi.mocked(mockSiteDao.getChangedArticles).mockResolvedValue(changedArticles);

			const response = await request(app)
				.put("/sites/1/articles")
				.send({ selectedArticleJrns: ["jrn:doc:1"] });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				needsUpdate: true,
				changedArticles,
			});
		});
	});

	describe("DELETE /:id", () => {
		it("should delete docsite by id", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.deleteSite).mockResolvedValue(undefined);

			const response = await request(app).delete("/sites/1");

			expect(response.status).toBe(204);
			expect(response.body).toEqual({});
			expect(mockSiteDao.deleteSite).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid id", async () => {
			const response = await request(app).delete("/sites/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid docsite ID" });
			expect(mockSiteDao.deleteSite).not.toHaveBeenCalled();
		});

		it("should handle negative id (valid parse, deletes non-existent)", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({ ...mockDocsite, id: -5 });
			vi.mocked(mockSiteDao.deleteSite).mockResolvedValue(undefined);

			const response = await request(app).delete("/sites/-5");

			expect(response.status).toBe(204);
			expect(mockSiteDao.deleteSite).toHaveBeenCalledWith(-5);
		});

		it("should return 204 even if docsite doesn't exist", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({ ...mockDocsite, id: 999 });
			vi.mocked(mockSiteDao.deleteSite).mockResolvedValue(undefined);

			const response = await request(app).delete("/sites/999");

			expect(response.status).toBe(204);
			expect(mockSiteDao.deleteSite).toHaveBeenCalledWith(999);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.deleteSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/sites/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete site" });
		});
	});

	describe("POST /:id/cancel-build", () => {
		it("should cancel an in-progress build", async () => {
			const buildingSite = { ...mockDocsite, status: "building" as const };
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingSite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue({
				...buildingSite,
				status: "error",
				metadata: {
					...buildingSite.metadata,
					lastBuildError: "Build cancelled by user",
				} as typeof mockDocsite.metadata,
			});

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "error",
					metadata: expect.objectContaining({
						lastBuildError: "Build cancelled by user",
					}),
				}),
			);
		});

		it("should cancel a pending build", async () => {
			const pendingSite = { ...mockDocsite, status: "pending" as const };
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(pendingSite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue({
				...pendingSite,
				status: "error",
				metadata: {
					...pendingSite.metadata,
					lastBuildError: "Build cancelled by user",
				} as typeof mockDocsite.metadata,
			});

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(200);
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).post("/sites/invalid/cancel-build");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 for non-existent site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/999/cancel-build");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 400 when site is not building", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({ ...mockDocsite, status: "active" as const });

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site is not currently building" });
		});

		it("should return 500 on database error", async () => {
			const buildingSite = { ...mockDocsite, status: "building" as const };
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingSite);
			vi.mocked(mockSiteDao.updateSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to cancel build" });
		});

		it("should handle site with null metadata", async () => {
			const buildingSiteNoMetadata = {
				...mockDocsite,
				status: "building" as const,
				metadata: null as unknown as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingSiteNoMetadata);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue({
				...buildingSiteNoMetadata,
				status: "error",
				metadata: { lastBuildError: "Build cancelled by user" } as typeof mockDocsite.metadata,
			});

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "error",
					metadata: expect.objectContaining({
						lastBuildError: "Build cancelled by user",
					}),
				}),
			);
		});

		it("should clean up temp directory when one exists for the build", async () => {
			const buildingSite = { ...mockDocsite, status: "building" as const };
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(buildingSite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue({
				...buildingSite,
				status: "error",
				metadata: {
					...buildingSite.metadata,
					lastBuildError: "Build cancelled by user",
				} as typeof mockDocsite.metadata,
			});

			// Mock temp directory exists
			vi.mocked(getBuildTempDir).mockReturnValue("/tmp/build-123");
			vi.mocked(cleanupTempDirectory).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/1/cancel-build");

			expect(response.status).toBe(200);
			expect(getBuildTempDir).toHaveBeenCalledWith(1);
			expect(cleanupTempDirectory).toHaveBeenCalledWith("/tmp/build-123");
			expect(unregisterBuildTempDir).toHaveBeenCalledWith(1);
		});
	});

	describe("GET /:id/changed-config-files", () => {
		it("should return empty array when site has no config file hashes", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should return empty array when site has no githubRepo", async () => {
			const siteWithHashes: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata ?? {}),
					githubRepo: undefined as unknown as string,
					configFileHashes: { metaTs: "abc123" },
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes);

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should return changed config files when hashes differ", async () => {
			const siteWithHashes = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					configFileHashes: { metaTs: "oldhash123456789", nextConfig: "oldhash987654321" },
				},
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes as Site);

			// Mock getContent to return different content (different hash)
			mockGetContent.mockImplementation((path: string) => {
				if (path === "content/_meta.ts") {
					return Promise.resolve({ content: Buffer.from("new content").toString("base64") });
				}
				if (path === "next.config.mjs") {
					return Promise.resolve({ content: Buffer.from("same content").toString("base64") });
				}
				return Promise.resolve(undefined);
			});

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			// Both will be changed since "new content" and "same content" don't match the stored hashes
			expect(response.body.changedConfigFiles.length).toBeGreaterThan(0);
		});

		it("should return empty array when hashes match", async () => {
			// Create a hash that matches what computeHash would produce for "test content"
			const crypto = await import("node:crypto");
			const testContent = "test content";
			const expectedHash = crypto.createHash("sha256").update(testContent, "utf8").digest("hex").substring(0, 16);

			const siteWithHashes = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					configFileHashes: { metaTs: expectedHash },
				},
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes as Site);

			// Mock getContent to return content that produces the same hash
			mockGetContent.mockImplementation((path: string) => {
				if (path === "content/_meta.ts") {
					return Promise.resolve({ content: Buffer.from(testContent).toString("base64") });
				}
				return Promise.resolve(undefined);
			});

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).get("/sites/invalid/changed-config-files");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/changed-config-files");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should handle getContent errors gracefully", async () => {
			const siteWithHashes = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					configFileHashes: { metaTs: "somehash1234567" },
				},
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes as Site);

			// Mock getContent to throw an error
			mockGetContent.mockRejectedValue(new Error("GitHub API error"));

			const response = await request(app).get("/sites/1/changed-config-files");

			// Should still return 200 with empty array (errors are logged but don't fail the request)
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should skip files when getContent returns undefined", async () => {
			const siteWithHashes = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					configFileHashes: { metaTs: "somehash1234567" },
				},
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes as Site);

			// Mock getContent to return undefined (file doesn't exist)
			mockGetContent.mockResolvedValue(undefined);

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should skip files when getContent returns a directory (no content property)", async () => {
			const siteWithHashes = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					configFileHashes: { metaTs: "somehash1234567" },
				},
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithHashes as Site);

			// Mock getContent to return a directory response (no content property)
			mockGetContent.mockResolvedValue({ type: "dir", name: "_meta.ts", path: "content/_meta.ts" });

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ changedConfigFiles: [] });
		});

		it("should skip files without stored hash", async () => {
			const siteWithPartialHashes: Site = {
				...mockDocsite,
				metadata: {
					...(mockDocsite.metadata ?? {}),
					configFileHashes: { nextConfig: "somehash1234567" },
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithPartialHashes);

			mockGetContent.mockImplementation((path: string) => {
				if (path === "next.config.mjs") {
					return Promise.resolve({ content: Buffer.from("different content").toString("base64") });
				}
				return Promise.resolve(undefined);
			});

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(200);
			// Should only check next.config.mjs since metaTs has no stored hash
			expect(response.body.changedConfigFiles).toEqual([
				{ path: "next.config.mjs", displayName: "Next.js Config (next.config.mjs)" },
			]);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/1/changed-config-files");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check config file changes" });
		});
	});

	describe("POST /:id/validate-meta", () => {
		it("should return valid true for valid _meta.ts content", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app)
				.post("/sites/1/validate-meta")
				.send({ content: 'export default { intro: "Introduction" }' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ valid: true });
		});

		it("should return valid false with error info for invalid syntax", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app)
				.post("/sites/1/validate-meta")
				.send({ content: "export default { invalid syntax" });

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBeDefined();
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app)
				.post("/sites/invalid/validate-meta")
				.send({ content: 'export default { intro: "Introduction" }' });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 400 when content is missing", async () => {
			const response = await request(app).post("/sites/1/validate-meta").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "content is required and must be a string" });
		});

		it("should return 400 when content is not a string", async () => {
			const response = await request(app).post("/sites/1/validate-meta").send({ content: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "content is required and must be a string" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/sites/1/validate-meta")
				.send({ content: 'export default { intro: "Introduction" }' });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/sites/1/validate-meta")
				.send({ content: 'export default { intro: "Introduction" }' });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to validate _meta.ts syntax" });
		});
	});

	describe("POST /format-code", () => {
		it("should return 400 when content is missing", async () => {
			const response = await request(app).post("/sites/format-code").send({ filePath: "test.ts" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "content is required" });
		});

		it("should return 400 when filePath is missing", async () => {
			const response = await request(app).post("/sites/format-code").send({ content: "const x = 1;" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "filePath is required" });
		});

		it("should return 400 for unsupported file type", async () => {
			const response = await request(app)
				.post("/sites/format-code")
				.send({ content: "# Markdown", filePath: "readme.md" });

			expect(response.status).toBe(400);
			expect(response.body.error).toContain("Unsupported file type");
		});
	});

	describe("GET /check-subdomain", () => {
		beforeEach(() => {
			clearCache();
		});

		it("should return available true for available subdomain", async () => {
			vi.mocked(mockSiteDao.getSiteBySubdomain).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/check-subdomain?subdomain=docs");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ available: true });
			expect(mockSiteDao.getSiteBySubdomain).toHaveBeenCalledWith("docs");
		});

		it("should return available false with suggestion for taken subdomain", async () => {
			vi.mocked(mockSiteDao.getSiteBySubdomain)
				.mockResolvedValueOnce(mockDocsite) // First check - taken
				.mockResolvedValueOnce(undefined); // Suggestion check - available

			const response = await request(app).get("/sites/check-subdomain?subdomain=docs");

			expect(response.status).toBe(200);
			expect(response.body.available).toBe(false);
			expect(response.body.suggestion).toBeDefined();
		});

		it("should return 400 when subdomain is missing", async () => {
			const response = await request(app).get("/sites/check-subdomain");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "subdomain query parameter is required" });
		});

		it("should return 400 for invalid subdomain format", async () => {
			const response = await request(app).get("/sites/check-subdomain?subdomain=ab");

			expect(response.status).toBe(400);
			expect(response.body.available).toBe(false);
			expect(response.body.error).toBeDefined();
		});

		it("should use cached result on subsequent calls", async () => {
			vi.mocked(mockSiteDao.getSiteBySubdomain).mockResolvedValue(undefined);

			// First call
			await request(app).get("/sites/check-subdomain?subdomain=cached");
			expect(mockSiteDao.getSiteBySubdomain).toHaveBeenCalledTimes(1);

			// Second call should use cache
			const response = await request(app).get("/sites/check-subdomain?subdomain=cached");
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ available: true });
			expect(mockSiteDao.getSiteBySubdomain).toHaveBeenCalledTimes(1); // Still 1, used cache
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSiteBySubdomain).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/check-subdomain?subdomain=test");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check subdomain" });
		});

		it("should find no suggestion when all candidates are taken", async () => {
			// All subdomain checks return existing site
			vi.mocked(mockSiteDao.getSiteBySubdomain).mockResolvedValue(mockDocsite);

			const response = await request(app).get("/sites/check-subdomain?subdomain=docs");

			expect(response.status).toBe(200);
			expect(response.body.available).toBe(false);
			expect(response.body.suggestion).toBeUndefined();
		});
	});

	describe("POST /:id/domains", () => {
		beforeEach(() => {
			vi.mocked(mockVercelDeployer.addDomainToProject).mockReset();
			mockCheckDnsConfiguration.mockReset();
			// Default: DNS not configured (most common case when adding a new domain)
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});
		});

		it("should add custom domain with verified status when DNS is configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: true,
			});
			// DNS is configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: true,
				recordType: "CNAME",
				actualValue: "cname.vercel-dns.com",
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(201);
			expect(response.body.domain).toBeDefined();
			expect(response.body.domain.domain).toBe("docs.example.com");
			expect(response.body.domain.status).toBe("verified");
		});

		it("should add custom domain with pending status when DNS is not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: true, // Vercel auto-verified
			});
			// DNS is NOT configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(201);
			expect(response.body.domain).toBeDefined();
			expect(response.body.domain.domain).toBe("docs.example.com");
			expect(response.body.domain.status).toBe("pending"); // Pending because DNS not configured
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).post("/sites/invalid/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 400 when domain is missing", async () => {
			const response = await request(app).post("/sites/1/domains").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "domain is required" });
		});

		it("should return 400 for invalid domain format", async () => {
			const response = await request(app).post("/sites/1/domains").send({ domain: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBeDefined();
		});

		it("should return 409 when domain is already in use by another site", async () => {
			const existingSite: Site = {
				...mockDocsite,
				id: 999,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.getSiteByCustomDomain).mockResolvedValue(existingSite);

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(409);
			expect(response.body).toEqual({ error: "Custom domain already in use by another site" });
			expect(mockSiteDao.getSiteByCustomDomain).toHaveBeenCalledWith("docs.example.com");
		});

		it("should successfully add domain when it is not in use by any site", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			// Domain is available (not in use by any site)
			vi.mocked(mockSiteDao.getSiteByCustomDomain).mockResolvedValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: true,
			});
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(201);
			expect(mockSiteDao.getSiteByCustomDomain).toHaveBeenCalledWith("docs.example.com");
			expect(response.body.domain).toBeDefined();
			expect(response.body.domain.domain).toBe("docs.example.com");
		});

		it("should allow adding domain when it is already on the same site", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			// Return the same site (id: 1) as the one we're adding the domain to
			vi.mocked(mockSiteDao.getSiteByCustomDomain).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: true,
			});
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(201);
			expect(mockSiteDao.getSiteByCustomDomain).toHaveBeenCalledWith("docs.example.com");
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/999/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 400 when site already has a custom domain", async () => {
			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "existing.example.com", status: "verified", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site already has a custom domain. Remove it first." });
		});

		it("should return 500 when Vercel token not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Vercel integration not configured" });
		});

		it("should return 400 when site has no Vercel project", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteNoRepo: Site = {
				...mockDocsite,
				metadata: {} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteNoRepo);

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site has no Vercel project configured" });
		});

		it("should return 400 when Vercel returns error", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				error: "Domain already exists on another project",
			});

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Domain already exists on another project" });
		});

		it("should return 500 on unexpected error", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/sites/1/domains").send({ domain: "docs.example.com" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to add domain" });
		});
	});

	describe("DELETE /:id/domains/:domain", () => {
		it("should remove custom domain successfully", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "verified", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.removeDomainFromProject).mockResolvedValue(undefined);

			const response = await request(app).delete("/sites/1/domains/docs.example.com");

			expect(response.status).toBe(204);
			expect(mockVercelDeployer.removeDomainFromProject).toHaveBeenCalledWith("test-site", "docs.example.com");
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).delete("/sites/invalid/domains/docs.example.com");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).delete("/sites/999/domains/docs.example.com");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 404 when domain not found on site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).delete("/sites/1/domains/nonexistent.example.com");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Domain not found on this site" });
		});

		it("should still remove domain from DB when no Vercel token", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "verified", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).delete("/sites/1/domains/docs.example.com");

			expect(response.status).toBe(204);
			expect(mockSiteDao.updateSite).toHaveBeenCalled();
		});

		it("should return 500 on unexpected error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/sites/1/domains/docs.example.com");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to remove domain" });
		});
	});

	describe("GET /:id/domains/:domain/status", () => {
		beforeEach(() => {
			mockCheckDnsConfiguration.mockReset();
			// Default: DNS not configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});
		});

		it("should return domain status from Vercel", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockResolvedValue({
				verified: false,
				verification: [{ type: "TXT", value: "abc123", domain: "_vercel.docs.example.com" }],
			});

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			expect(response.body.domain).toBeDefined();
			expect(response.body.verification).toBeDefined();
		});

		it("should update status when domain becomes fully verified (DNS + Vercel)", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockResolvedValue({
				verified: true,
			});
			// DNS is configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: true,
				recordType: "CNAME",
				actualValue: "cname.vercel-dns.com",
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("verified");
			expect(mockSiteDao.updateSite).toHaveBeenCalled();
		});

		it("should remain pending when Vercel verified but DNS not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockResolvedValue({
				verified: true, // Vercel says verified
			});
			// DNS is NOT configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			// Should remain pending since DNS is not configured
			expect(response.body.domain.status).toBe("pending");
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).get("/sites/invalid/domains/docs.example.com/status");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/domains/docs.example.com/status");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 404 when domain not found on site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).get("/sites/1/domains/nonexistent.example.com/status");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Domain not found on this site" });
		});

		it("should return cached status when no Vercel token", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("pending");
		});

		it("should return cached status when Vercel call fails", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockRejectedValue(new Error("Vercel API error"));

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("pending");
		});

		it("should return 500 on unexpected error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to check status" });
		});

		it("should return cached status when site has no project name", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteNoRepo: Site = {
				...mockDocsite,
				metadata: {
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteNoRepo);

			const response = await request(app).get("/sites/1/domains/docs.example.com/status");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("pending");
		});
	});

	describe("POST /:id/domains/:domain/verify", () => {
		beforeEach(() => {
			mockCheckDnsConfiguration.mockReset();
			// Default: DNS not configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});
		});

		it("should verify domain successfully when DNS and Vercel both verified", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.verifyDomain).mockResolvedValue({
				verified: true,
			});
			// DNS is configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: true,
				recordType: "CNAME",
				actualValue: "cname.vercel-dns.com",
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("verified");
		});

		it("should return pending status when Vercel verified but DNS not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.verifyDomain).mockResolvedValue({
				verified: true, // Vercel says verified
			});
			// DNS is NOT configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("pending"); // Pending because DNS not configured
		});

		it("should return pending status when not yet verified", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.verifyDomain).mockResolvedValue({
				verified: false,
				verification: [{ type: "TXT", value: "abc123", domain: "_vercel.docs.example.com" }],
			});

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(200);
			expect(response.body.domain.status).toBe("pending");
			expect(response.body.domain.verification).toBeDefined();
		});

		it("should update verified domain to pending when DNS becomes unconfigured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			// Domain was previously verified but DNS is no longer configured
			const siteWithVerifiedDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "verified", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithVerifiedDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.verifyDomain).mockResolvedValue({
				verified: true, // Vercel still says verified
				verification: [{ type: "TXT", value: "abc123", domain: "_vercel.docs.example.com" }],
			});
			// DNS is NO LONGER configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(200);
			// Should revert from verified to pending because DNS is not configured
			expect(response.body.domain.status).toBe("pending");
			expect(mockSiteDao.updateSite).toHaveBeenCalled();
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).post("/sites/invalid/domains/docs.example.com/verify");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/999/domains/docs.example.com/verify");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 404 when domain not found on site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/domains/nonexistent.example.com/verify");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Domain not found on this site" });
		});

		it("should return 500 when Vercel token not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Vercel integration not configured" });
		});

		it("should return 400 when site has no Vercel project", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteNoRepo: Site = {
				...mockDocsite,
				metadata: {
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteNoRepo);

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site has no Vercel project configured" });
		});

		it("should return 500 on unexpected error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/sites/1/domains/docs.example.com/verify");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to verify domain" });
		});
	});

	describe("POST /:id/domains/refresh", () => {
		beforeEach(() => {
			mockCheckDnsConfiguration.mockReset();
			// Default: DNS not configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});
		});

		it("should refresh all domain statuses with verified when DNS configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockResolvedValue({
				verified: true,
			});
			// DNS is configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: true,
				recordType: "CNAME",
				actualValue: "cname.vercel-dns.com",
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(200);
			expect(response.body.domains).toHaveLength(1);
			expect(response.body.domains[0].status).toBe("verified");
		});

		it("should return pending when Vercel verified but DNS not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockResolvedValue({
				verified: true, // Vercel says verified
			});
			// DNS is NOT configured
			mockCheckDnsConfiguration.mockResolvedValue({
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: "cname.vercel-dns.com",
			});

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(200);
			expect(response.body.domains).toHaveLength(1);
			expect(response.body.domains[0].status).toBe("pending"); // Pending because DNS not configured
		});

		it("should return empty array when no custom domains", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ domains: [] });
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).post("/sites/invalid/domains/refresh");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site not found", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/999/domains/refresh");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 500 when Vercel token not configured", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Vercel integration not configured" });
		});

		it("should return 400 when site has no Vercel project", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteNoRepo: Site = {
				...mockDocsite,
				metadata: {
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteNoRepo);

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site has no Vercel project configured" });
		});

		it("should mark domain as failed when Vercel call fails", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-token",
			} as ReturnType<typeof getConfig>);

			const siteWithDomain: Site = {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{ domain: "docs.example.com", status: "pending", addedAt: new Date().toISOString() },
					],
				} as typeof mockDocsite.metadata,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithDomain);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockVercelDeployer.getDomainStatus).mockRejectedValue(new Error("Vercel API error"));

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(200);
			expect(response.body.domains).toHaveLength(1);
			expect(response.body.domains[0].status).toBe("failed");
			expect(response.body.domains[0].verificationError).toBe("Vercel API error");
		});

		it("should return 500 on unexpected error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/sites/1/domains/refresh");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to refresh domain statuses" });
		});
	});

	describe("GET /:id/github/tree", () => {
		it("should return repository tree for valid site", async () => {
			const mockTreeData = {
				sha: "abc123",
				url: "https://api.github.com/repos/Jolli-sample-repos/test-site/git/trees/main",
				tree: [
					{ path: "README.md", type: "blob", sha: "def456" },
					{ path: "docs", type: "tree", sha: "ghi789" },
					{ path: "docs/index.md", type: "blob", sha: "jkl012" },
				],
				truncated: false,
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetTree.mockResolvedValue({ data: mockTreeData });

			const response = await request(app).get("/sites/1/github/tree");

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockTreeData);
			expect(mockGetTree).toHaveBeenCalledWith({
				owner: "Jolli-sample-repos",
				repo: "test-site",
				tree_sha: "main",
				recursive: "1",
			});
		});

		it("should use custom branch when provided", async () => {
			const mockTreeData = { sha: "abc123", tree: [], truncated: false };

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetTree.mockResolvedValue({ data: mockTreeData });

			const response = await request(app).get("/sites/1/github/tree?branch=develop");

			expect(response.status).toBe(200);
			expect(mockGetTree).toHaveBeenCalledWith({
				owner: "Jolli-sample-repos",
				repo: "test-site",
				tree_sha: "develop",
				recursive: "1",
			});
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).get("/sites/invalid/github/tree");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 for non-existent site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/github/tree");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 400 for site without GitHub repository", async () => {
			const siteWithoutGithub: Site = {
				...mockDocsite,
				metadata: undefined,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithoutGithub);

			const response = await request(app).get("/sites/1/github/tree");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site does not have a GitHub repository" });
		});

		it("should return 500 when GitHub API fails", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetTree.mockRejectedValue(new Error("GitHub API error"));

			const response = await request(app).get("/sites/1/github/tree");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get repository tree" });
		});
	});

	describe("GET /:id/github/content", () => {
		it("should return file content for valid path", async () => {
			const mockContentData = {
				name: "README.md",
				path: "README.md",
				sha: "abc123",
				type: "file",
				content: "IyBUZXN0IFJlcG9zaXRvcnk=",
				encoding: "base64",
			};

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetRepoContent.mockResolvedValue({ data: mockContentData });

			const response = await request(app).get("/sites/1/github/content?path=README.md");

			expect(response.status).toBe(200);
			expect(response.body).toEqual(mockContentData);
			expect(mockGetRepoContent).toHaveBeenCalledWith({
				owner: "Jolli-sample-repos",
				repo: "test-site",
				path: "README.md",
				ref: "main",
			});
		});

		it("should use custom branch when provided", async () => {
			const mockContentData = { name: "README.md", content: "SGVsbG8=" };

			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetRepoContent.mockResolvedValue({ data: mockContentData });

			const response = await request(app).get("/sites/1/github/content?path=README.md&branch=develop");

			expect(response.status).toBe(200);
			expect(mockGetRepoContent).toHaveBeenCalledWith({
				owner: "Jolli-sample-repos",
				repo: "test-site",
				path: "README.md",
				ref: "develop",
			});
		});

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).get("/sites/invalid/github/content?path=README.md");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 400 when path parameter is missing", async () => {
			const response = await request(app).get("/sites/1/github/content");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "path query parameter is required" });
		});

		it("should return 404 for non-existent site", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/github/content?path=README.md");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 400 for site without GitHub repository", async () => {
			const siteWithoutGithub: Site = {
				...mockDocsite,
				metadata: undefined,
			};
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(siteWithoutGithub);

			const response = await request(app).get("/sites/1/github/content?path=README.md");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site does not have a GitHub repository" });
		});

		it("should return 500 when GitHub API fails", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			mockGetRepoContent.mockRejectedValue(new Error("GitHub API error"));

			const response = await request(app).get("/sites/1/github/content?path=README.md");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get file content" });
		});
	});

	describe("POST /:id/auth/keys", () => {
		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).post("/sites/invalid/auth/keys");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site does not exist", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).post("/sites/999/auth/keys");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should generate and return public key for new site", async () => {
			const { jwtAuth: _, ...metadataWithoutJwtAuth } = mockDocsite.metadata as SiteMetadata;
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: metadataWithoutJwtAuth as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: false,
						mode: "full",
						loginUrl: "",
						publicKey: "test-public-key",
						privateKey: "test-private-key",
					},
				} as SiteMetadata,
			});

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("publicKey");
			expect(response.body.publicKey).toContain("BEGIN PUBLIC KEY");
			expect(response.body).not.toHaveProperty("privateKey");
			expect(mockSiteDao.updateSite).toHaveBeenCalled();
		});

		it("should return existing public key if keys already exist (idempotent)", async () => {
			const existingPublicKey = "-----BEGIN PUBLIC KEY-----\nExistingKey\n-----END PUBLIC KEY-----";
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: existingPublicKey,
						privateKey: "existing-private-key",
					},
				} as SiteMetadata,
			});

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ publicKey: existingPublicKey });
			expect(mockSiteDao.updateSite).not.toHaveBeenCalled();
		});

		it("should generate new keys if only public key exists without private key", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: "orphan-public-key",
						// No privateKey
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("publicKey");
			expect(response.body.publicKey).toContain("BEGIN PUBLIC KEY");
			expect(mockSiteDao.updateSite).toHaveBeenCalled();
		});

		it("should preserve existing jwtAuth settings when generating keys", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: true,
						mode: "partial",
						loginUrl: "/custom-login",
						publicKey: "",
						allowedGroups: ["admin", "users"],
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							enabled: true,
							mode: "partial",
							loginUrl: "/custom-login",
							allowedGroups: ["admin", "users"],
							publicKey: expect.stringContaining("BEGIN PUBLIC KEY"),
							privateKey: expect.stringContaining("BEGIN PRIVATE KEY"),
						}),
					}),
				}),
			);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to generate site auth keys" });
		});

		it("should handle site with no metadata", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: undefined,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).post("/sites/1/auth/keys");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("publicKey");
			expect(response.body.publicKey).toContain("BEGIN PUBLIC KEY");
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							enabled: false,
							mode: "full",
							loginUrl: "",
							publicKey: expect.stringContaining("BEGIN PUBLIC KEY"),
							privateKey: expect.stringContaining("BEGIN PRIVATE KEY"),
						}),
					}),
				}),
			);
		});
	});

	describe("PUT /:id/auth/config", () => {
		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).put("/sites/invalid/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site does not exist", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).put("/sites/999/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 400 when enabled is not a boolean", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: "true", mode: "full" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "enabled must be a boolean" });
		});

		it("should return 400 when enabled is true but mode is invalid", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "mode must be 'full' or 'partial' when enabled" });
		});

		it("should enable JWT auth and generate keys on first enable", async () => {
			const { jwtAuth: _, ...metadataWithoutJwtAuth } = mockDocsite.metadata as SiteMetadata;
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: metadataWithoutJwtAuth as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							enabled: true,
							mode: "full",
							publicKey: expect.stringContaining("BEGIN PUBLIC KEY"),
							privateKey: expect.stringContaining("BEGIN PRIVATE KEY"),
						}),
					}),
				}),
			);
		});

		it("should update mode without regenerating keys when keys exist", async () => {
			const existingPublicKey = "-----BEGIN PUBLIC KEY-----\nExistingKey\n-----END PUBLIC KEY-----";
			const existingPrivateKey = "-----BEGIN PRIVATE KEY-----\nExistingKey\n-----END PRIVATE KEY-----";
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: existingPublicKey,
						privateKey: existingPrivateKey,
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "partial" });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							enabled: true,
							mode: "partial",
							publicKey: existingPublicKey,
							privateKey: existingPrivateKey,
						}),
					}),
				}),
			);
		});

		it("should disable JWT auth", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: "test-key",
						privateKey: "test-private",
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: false });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							enabled: false,
						}),
					}),
				}),
			);
		});

		it("should use custom loginUrl when provided", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const customLoginUrl = "https://custom.example.com/login";
			const response = await request(app)
				.put("/sites/1/auth/config")
				.send({ enabled: true, mode: "full", loginUrl: customLoginUrl });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							loginUrl: customLoginUrl,
						}),
					}),
				}),
			);
		});

		it("should use default loginUrl when not provided", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(mockDocsite);
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(200);
			expect(mockSiteDao.updateSite).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						jwtAuth: expect.objectContaining({
							loginUrl: expect.stringContaining("/api/sites/1/auth/jwt"),
						}),
					}),
				}),
			);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update JWT auth config" });
		});

		it("should sync env vars to Vercel when VERCEL_TOKEN is set and site has project", async () => {
			// Mock config to return VERCEL_TOKEN
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-vercel-token",
				TOKEN_SECRET: "test-secret-key-for-jwt-signing",
				ORIGIN: "https://app.jolli.com",
			} as ReturnType<typeof getConfig>);

			const existingPublicKey = "-----BEGIN PUBLIC KEY-----\nTestKey\n-----END PUBLIC KEY-----";
			const existingPrivateKey = "-----BEGIN PRIVATE KEY-----\nTestKey\n-----END PRIVATE KEY-----";
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					githubRepo: "test-org/test-project",
					jwtAuth: {
						enabled: false,
						mode: "full",
						loginUrl: "/login",
						publicKey: existingPublicKey,
						privateKey: existingPrivateKey,
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			mockVercelDeployer.syncJwtAuthEnvVars.mockResolvedValue(undefined);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(200);
			expect(mockVercelDeployer.syncJwtAuthEnvVars).toHaveBeenCalledWith(
				"test-project",
				true,
				"full",
				existingPublicKey,
				expect.stringContaining("/api/sites/1/auth/jwt"),
			);

			// Reset config mock
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
				TOKEN_SECRET: "test-secret-key-for-jwt-signing",
			} as ReturnType<typeof getConfig>);
		});

		it("should not sync env vars when VERCEL_TOKEN is not set", async () => {
			const existingPublicKey = "-----BEGIN PUBLIC KEY-----\nTestKey\n-----END PUBLIC KEY-----";
			const existingPrivateKey = "-----BEGIN PRIVATE KEY-----\nTestKey\n-----END PRIVATE KEY-----";
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					githubRepo: "test-org/test-project",
					jwtAuth: {
						enabled: false,
						mode: "full",
						loginUrl: "/login",
						publicKey: existingPublicKey,
						privateKey: existingPrivateKey,
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			expect(response.status).toBe(200);
			expect(mockVercelDeployer.syncJwtAuthEnvVars).not.toHaveBeenCalled();
		});

		it("should succeed even if Vercel env var sync fails", async () => {
			// Mock config to return VERCEL_TOKEN
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: "test-vercel-token",
				TOKEN_SECRET: "test-secret-key-for-jwt-signing",
				ORIGIN: "https://app.jolli.com",
			} as ReturnType<typeof getConfig>);

			const existingPublicKey = "-----BEGIN PUBLIC KEY-----\nTestKey\n-----END PUBLIC KEY-----";
			const existingPrivateKey = "-----BEGIN PRIVATE KEY-----\nTestKey\n-----END PRIVATE KEY-----";
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					githubRepo: "test-org/test-project",
					jwtAuth: {
						enabled: false,
						mode: "full",
						loginUrl: "/login",
						publicKey: existingPublicKey,
						privateKey: existingPrivateKey,
					},
				} as SiteMetadata,
			});
			vi.mocked(mockSiteDao.updateSite).mockResolvedValue(mockDocsite);
			mockVercelDeployer.syncJwtAuthEnvVars.mockRejectedValue(new Error("Vercel API error"));

			const response = await request(app).put("/sites/1/auth/config").send({ enabled: true, mode: "full" });

			// Should still succeed - env var sync failure doesn't block the response
			expect(response.status).toBe(200);

			// Reset config mock
			vi.mocked(getConfig).mockReturnValue({
				VERCEL_TOKEN: undefined,
				TOKEN_SECRET: "test-secret-key-for-jwt-signing",
			} as ReturnType<typeof getConfig>);
		});
	});
});

describe("extractConfigFileHashes", () => {
	it("should extract hash for content/_meta.ts file", () => {
		const files = [{ path: "content/_meta.ts", content: "test content" }];
		const result = extractConfigFileHashes(files);

		expect(result).toBeDefined();
		expect(result?.metaTs).toBeDefined();
		expect(typeof result?.metaTs).toBe("string");
	});

	it("should extract hash for next.config.mjs file", () => {
		const files = [{ path: "next.config.mjs", content: "module.exports = {}" }];
		const result = extractConfigFileHashes(files);

		expect(result).toBeDefined();
		expect(result?.nextConfig).toBeDefined();
		expect(typeof result?.nextConfig).toBe("string");
	});

	it("should extract hashes for multiple config files", () => {
		const files = [
			{ path: "content/_meta.ts", content: "export default {}" },
			{ path: "next.config.mjs", content: "module.exports = {}" },
		];
		const result = extractConfigFileHashes(files);

		expect(result).toBeDefined();
		expect(result?.metaTs).toBeDefined();
		expect(result?.nextConfig).toBeDefined();
	});

	it("should return undefined when no config files are present", () => {
		const files = [
			{ path: "README.md", content: "# README" },
			{ path: "src/index.ts", content: "console.log('hello')" },
		];
		const result = extractConfigFileHashes(files);

		expect(result).toBeUndefined();
	});

	it("should return undefined for empty file list", () => {
		const result = extractConfigFileHashes([]);

		expect(result).toBeUndefined();
	});

	it("should ignore non-config files", () => {
		const files = [
			{ path: "content/intro.mdx", content: "# Intro" },
			{ path: "content/_meta.ts", content: "export default {}" },
			{ path: "package.json", content: "{}" },
		];
		const result = extractConfigFileHashes(files);

		expect(result).toBeDefined();
		expect(result?.metaTs).toBeDefined();
		// Should not have any other properties
		expect(Object.keys(result as object)).toEqual(["metaTs"]);
	});
});

describe("Helper functions", () => {
	describe("computeHash", () => {
		it("should compute a 16-character SHA-256 hash", () => {
			const result = computeHash("test content");
			expect(result).toHaveLength(16);
			expect(result).toMatch(/^[a-f0-9]+$/);
		});

		it("should return consistent hash for same content", () => {
			const content = "export default { navigation: [] };";
			const hash1 = computeHash(content);
			const hash2 = computeHash(content);
			expect(hash1).toBe(hash2);
		});

		it("should return different hashes for different content", () => {
			const hash1 = computeHash("content1");
			const hash2 = computeHash("content2");
			expect(hash1).not.toBe(hash2);
		});

		it("should handle empty string", () => {
			const result = computeHash("");
			expect(result).toHaveLength(16);
			expect(result).toMatch(/^[a-f0-9]+$/);
		});

		it("should handle unicode content", () => {
			const result = computeHash("日本語テスト 🎉");
			expect(result).toHaveLength(16);
			expect(result).toMatch(/^[a-f0-9]+$/);
		});
	});

	describe("extractConfigFileHashes", () => {
		it("should extract metaTs hash when content/_meta.ts is present", () => {
			const files = [
				{ path: "content/_meta.ts", content: "export default {};" },
				{ path: "content/intro.mdx", content: "# Intro" },
			];
			const result = extractConfigFileHashes(files);
			expect(result).toBeDefined();
			expect(result?.metaTs).toHaveLength(16);
			expect(result?.nextConfig).toBeUndefined();
		});

		it("should extract nextConfig hash when next.config.mjs is present", () => {
			const files = [
				{ path: "next.config.mjs", content: "export default {};" },
				{ path: "content/intro.mdx", content: "# Intro" },
			];
			const result = extractConfigFileHashes(files);
			expect(result).toBeDefined();
			expect(result?.nextConfig).toHaveLength(16);
			expect(result?.metaTs).toBeUndefined();
		});

		it("should extract both hashes when both config files are present", () => {
			const files = [
				{ path: "content/_meta.ts", content: "export default { nav: [] };" },
				{ path: "next.config.mjs", content: "export default { reactStrictMode: true };" },
				{ path: "content/intro.mdx", content: "# Intro" },
			];
			const result = extractConfigFileHashes(files);
			expect(result).toBeDefined();
			expect(result?.metaTs).toHaveLength(16);
			expect(result?.nextConfig).toHaveLength(16);
		});

		it("should return undefined when no config files are present", () => {
			const files = [
				{ path: "content/intro.mdx", content: "# Intro" },
				{ path: "content/guide.mdx", content: "# Guide" },
			];
			const result = extractConfigFileHashes(files);
			expect(result).toBeUndefined();
		});

		it("should return undefined for empty files array", () => {
			const result = extractConfigFileHashes([]);
			expect(result).toBeUndefined();
		});

		it("should not extract hashes for similarly named files", () => {
			const files = [
				{ path: "content/_meta.tsx", content: "export default {};" }, // Different extension
				{ path: "next.config.js", content: "module.exports = {};" }, // Different extension
				{ path: "other/content/_meta.ts", content: "export default {};" }, // Different path
			];
			const result = extractConfigFileHashes(files);
			expect(result).toBeUndefined();
		});
	});

	describe("extractFolderAndFile", () => {
		it("should extract folder path and filename from path with slashes", () => {
			const result = extractFolderAndFile("guides/getting-started/intro.mdx");
			expect(result.folderPath).toBe("guides/getting-started");
			expect(result.fileName).toBe("intro.mdx");
		});

		it("should handle root-level files (no slashes)", () => {
			const result = extractFolderAndFile("intro.mdx");
			expect(result.folderPath).toBe("");
			expect(result.fileName).toBe("intro.mdx");
		});

		it("should handle single-level folder", () => {
			const result = extractFolderAndFile("guides/intro.mdx");
			expect(result.folderPath).toBe("guides");
			expect(result.fileName).toBe("intro.mdx");
		});

		it("should handle _meta.ts files in subfolders", () => {
			const result = extractFolderAndFile("api/reference/_meta.ts");
			expect(result.folderPath).toBe("api/reference");
			expect(result.fileName).toBe("_meta.ts");
		});
	});

	describe("processContentFile", () => {
		it("should add MDX file slug to folder contents", () => {
			const folderContents = new Map<string, FolderContent>();
			const file = { path: "content/intro.mdx", content: "# Introduction" };

			const result = processContentFile(file, folderContents);

			expect(result).toBeUndefined();
			expect(folderContents.get("")).toEqual({ slugs: ["intro"] });
		});

		it("should return root meta content for root _meta.ts", () => {
			const folderContents = new Map<string, FolderContent>();
			const metaContent = "export default { intro: 'Introduction' };";
			const file = { path: "content/_meta.ts", content: metaContent };

			const result = processContentFile(file, folderContents);

			expect(result).toBe(metaContent);
			expect(folderContents.get("")?.meta).toBe(metaContent);
		});

		it("should not return content for non-root _meta.ts", () => {
			const folderContents = new Map<string, FolderContent>();
			const metaContent = "export default { guide: 'Guide' };";
			const file = { path: "content/guides/_meta.ts", content: metaContent };

			const result = processContentFile(file, folderContents);

			expect(result).toBeUndefined();
			expect(folderContents.get("guides")?.meta).toBe(metaContent);
		});

		it("should accumulate multiple slugs in same folder", () => {
			const folderContents = new Map<string, FolderContent>();

			processContentFile({ path: "content/guides/intro.mdx", content: "# Intro" }, folderContents);
			processContentFile({ path: "content/guides/setup.mdx", content: "# Setup" }, folderContents);

			expect(folderContents.get("guides")?.slugs).toEqual(["intro", "setup"]);
		});

		it("should ignore non-MDX and non-meta files", () => {
			const folderContents = new Map<string, FolderContent>();

			processContentFile({ path: "content/image.png", content: "" }, folderContents);

			// Folder entry is created but has no slugs
			expect(folderContents.get("")?.slugs).toEqual([]);
		});

		it("should handle deeply nested paths", () => {
			const folderContents = new Map<string, FolderContent>();
			const file = { path: "content/api/v2/endpoints/users.mdx", content: "# Users API" };

			processContentFile(file, folderContents);

			expect(folderContents.get("api/v2/endpoints")?.slugs).toEqual(["users"]);
		});
	});

	describe("convertToFolderMetasArray", () => {
		it("should convert folder contents map to array format", () => {
			const folderContents = new Map<string, FolderContent>([
				["", { meta: "export default {};", slugs: ["intro"] }],
				["guides", { meta: "export default { guide: 'Guide' };", slugs: ["setup", "config"] }],
			]);

			const result = convertToFolderMetasArray(folderContents);

			expect(result).toHaveLength(2);
			expect(result).toContainEqual({
				folderPath: "",
				metaContent: "export default {};",
				slugs: ["intro"],
			});
			expect(result).toContainEqual({
				folderPath: "guides",
				metaContent: "export default { guide: 'Guide' };",
				slugs: ["setup", "config"],
			});
		});

		it("should filter out empty folders (no meta and no slugs)", () => {
			const folderContents = new Map<string, FolderContent>([
				["", { slugs: ["intro"] }],
				["empty", { slugs: [] }],
				["has-meta", { meta: "export default {};", slugs: [] }],
			]);

			const result = convertToFolderMetasArray(folderContents);

			expect(result).toHaveLength(2);
			expect(result.find(f => f.folderPath === "empty")).toBeUndefined();
		});

		it("should use empty string for missing meta content", () => {
			const folderContents = new Map<string, FolderContent>([["guides", { slugs: ["intro"] }]]);

			const result = convertToFolderMetasArray(folderContents);

			expect(result[0].metaContent).toBe("");
		});

		it("should return empty array for empty map", () => {
			const folderContents = new Map<string, FolderContent>();

			const result = convertToFolderMetasArray(folderContents);

			expect(result).toEqual([]);
		});

		it("should include folders with only meta content", () => {
			const folderContents = new Map<string, FolderContent>([
				["api", { meta: "export default { endpoints: 'Endpoints' };", slugs: [] }],
			]);

			const result = convertToFolderMetasArray(folderContents);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				folderPath: "api",
				metaContent: "export default { endpoints: 'Endpoints' };",
				slugs: [],
			});
		});
	});

	describe("registerJolliSiteDomain", () => {
		beforeEach(() => {
			vi.mocked(mockVercelDeployer.addDomainToProject).mockReset();
		});

		it("should return empty object when JOLLI_SITE_ENABLED is false", async () => {
			const config = {
				JOLLI_SITE_ENABLED: false,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({});
			expect(mockVercelDeployer.addDomainToProject).not.toHaveBeenCalled();
		});

		it("should register domain and return subdomain info when enabled", async () => {
			const config = {
				JOLLI_SITE_ENABLED: true,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({ verified: true });

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({
				subdomain: "my-docs",
				jolliSiteDomain: expect.stringContaining("my-docs"),
			});
			expect(mockVercelDeployer.addDomainToProject).toHaveBeenCalledWith(
				"test-project",
				expect.stringContaining("my-docs"),
			);
		});

		it("should return empty object and not throw when domain registration fails", async () => {
			const config = {
				JOLLI_SITE_ENABLED: true,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			vi.mocked(mockVercelDeployer.addDomainToProject).mockRejectedValue(new Error("Vercel API error"));

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({});
			expect(mockVercelDeployer.addDomainToProject).toHaveBeenCalled();
		});

		it("should handle unknown error types gracefully", async () => {
			const config = {
				JOLLI_SITE_ENABLED: true,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			vi.mocked(mockVercelDeployer.addDomainToProject).mockRejectedValue("string error");

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({});
		});

		it("should return empty object when domain already exists (409 conflict)", async () => {
			const config = {
				JOLLI_SITE_ENABLED: true,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: false,
				error: "Domain already exists on another project",
			});

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({});
			expect(mockVercelDeployer.addDomainToProject).toHaveBeenCalled();
		});

		it("should return empty object when domain is owned by another account (403)", async () => {
			const config = {
				JOLLI_SITE_ENABLED: true,
				JOLLI_SITE_DOMAIN: "jolli.site",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			vi.mocked(mockVercelDeployer.addDomainToProject).mockResolvedValue({
				verified: false,
				error: "Domain is owned by another Vercel account",
			});

			const result = await registerJolliSiteDomain(
				mockVercelDeployer as never,
				"my-docs",
				"test-project",
				42,
				config,
			);

			expect(result).toEqual({});
			expect(mockVercelDeployer.addDomainToProject).toHaveBeenCalled();
		});
	});

	describe("writeFileTreeEntry", () => {
		it("should write text files with utf-8 encoding", async () => {
			const { writeFile } = await import("node:fs/promises");
			vi.mocked(writeFile).mockResolvedValue(undefined);

			const file = {
				path: "content/test.mdx",
				content: "# Hello World",
			};

			await writeFileTreeEntry("/tmp/test/content/test.mdx", file);

			expect(writeFile).toHaveBeenCalledWith("/tmp/test/content/test.mdx", "# Hello World", "utf-8");
		});

		it("should write base64-encoded files as binary", async () => {
			const { writeFile } = await import("node:fs/promises");
			vi.mocked(writeFile).mockResolvedValue(undefined);

			// A simple PNG header in base64
			const pngBase64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
			const file = {
				path: "public/images/test.png",
				content: pngBase64,
				encoding: "base64" as const,
			};

			await writeFileTreeEntry("/tmp/test/public/images/test.png", file);

			expect(writeFile).toHaveBeenCalledWith(
				"/tmp/test/public/images/test.png",
				Buffer.from(pngBase64, "base64"),
			);
		});
	});

	describe("bundleImagesIntoFilesImpl", () => {
		it("should skip bundling when no image storage service is provided", async () => {
			const files = [{ path: "content/article.mdx", content: "# Test" }];

			const result = await bundleImagesIntoFilesImpl(files, 1, 1, undefined, "tenant-123");

			expect(result.files).toEqual(files);
			expect(result.orphanedImagePaths).toEqual([]);
		});

		it("should skip bundling when no tenant ID is provided", async () => {
			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [{ path: "content/article.mdx", content: "# Test" }];

			const result = await bundleImagesIntoFilesImpl(files, 1, 1, mockImageStorageService as never, undefined);

			expect(result.files).toEqual(files);
			expect(result.orphanedImagePaths).toEqual([]);
		});

		it("should return files unchanged when no content files exist", async () => {
			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [{ path: "package.json", content: "{}" }];

			const result = await bundleImagesIntoFilesImpl(files, 1, 1, mockImageStorageService as never, "tenant-123");

			expect(result.files).toEqual(files);
			expect(result.orphanedImagePaths).toEqual([]);
		});

		it("should detect orphaned images when existing file paths are provided", async () => {
			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [{ path: "package.json", content: "{}" }];
			const existingFilePaths = ["public/images/old-image.png", "content/article.mdx"];

			const result = await bundleImagesIntoFilesImpl(
				files,
				1,
				1,
				mockImageStorageService as never,
				"tenant-123",
				existingFilePaths,
			);

			expect(result.files).toEqual(files);
			expect(result.orphanedImagePaths).toEqual(["public/images/old-image.png"]);
		});

		it("should bundle images from MDX content files", async () => {
			mockBundleSiteImages.mockResolvedValue({
				imageFiles: [
					{
						path: "public/images/abc12345-test.png",
						content: "base64data",
						encoding: "base64",
					},
				],
				transformedArticles: [{ content: "# Test\n\n![](/images/abc12345-test.png)" }],
			});

			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [
				{ path: "content/article.mdx", content: "# Test\n\n![](/api/images/tenant/org/_default/test.png)" },
			];

			const result = await bundleImagesIntoFilesImpl(files, 1, 1, mockImageStorageService as never, "tenant-123");

			expect(mockBundleSiteImages).toHaveBeenCalled();
			expect(result.files.length).toBeGreaterThanOrEqual(1);
		});

		it("should detect orphaned images when regenerating with existing images", async () => {
			mockBundleSiteImages.mockResolvedValue({
				imageFiles: [
					{
						path: "public/images/new-image.png",
						content: "base64data",
						encoding: "base64",
					},
				],
				transformedArticles: [{ content: "# Test\n\n![](/images/new-image.png)" }],
			});

			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [
				{ path: "content/article.mdx", content: "# Test\n\n![](/api/images/tenant/org/_default/new.png)" },
			];
			const existingFilePaths = [
				"public/images/old-image.png",
				"public/images/another-old.png",
				"content/article.mdx",
			];

			const result = await bundleImagesIntoFilesImpl(
				files,
				1,
				1,
				mockImageStorageService as never,
				"tenant-123",
				existingFilePaths,
			);

			expect(mockBundleSiteImages).toHaveBeenCalled();
			// Should detect old images as orphaned (not in new bundle)
			expect(result.orphanedImagePaths).toContain("public/images/old-image.png");
			expect(result.orphanedImagePaths).toContain("public/images/another-old.png");
		});

		it("should return files unchanged when bundleSiteImages returns no images", async () => {
			mockBundleSiteImages.mockResolvedValue({
				imageFiles: [],
				transformedArticles: [{ content: "# Test without images" }],
			});

			const mockImageStorageService = {
				downloadImage: vi.fn(),
				uploadImage: vi.fn(),
				deleteImage: vi.fn(),
				getSignedUrl: vi.fn(),
			};
			const files = [{ path: "content/article.mdx", content: "# Test without images" }];

			const result = await bundleImagesIntoFilesImpl(files, 1, 1, mockImageStorageService as never, "tenant-123");

			expect(result.files).toEqual(files);
			expect(result.orphanedImagePaths).toEqual([]);
		});
	});

	describe("getGitHubOrg", () => {
		it("should return GITHUB_ORG_NONPROD when SITE_ENV is 'local'", () => {
			const mockConfig = {
				SITE_ENV: "local",
				GITHUB_ORG: "Some-Org",
				GITHUB_ORG_NONPROD: "My-Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("My-Sample-Repos");
		});

		it("should return GITHUB_ORG_NONPROD when SITE_ENV is 'dev'", () => {
			const mockConfig = {
				SITE_ENV: "dev",
				GITHUB_ORG: "Some-Org",
				GITHUB_ORG_NONPROD: "Dev-Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("Dev-Sample-Repos");
		});

		it("should return GITHUB_ORG_NONPROD when SITE_ENV is 'preview'", () => {
			const mockConfig = {
				SITE_ENV: "preview",
				GITHUB_ORG: "Some-Org",
				GITHUB_ORG_NONPROD: "Preview-Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("Preview-Sample-Repos");
		});

		it("should return configured GITHUB_ORG when SITE_ENV is 'prod'", () => {
			const mockConfig = {
				SITE_ENV: "prod",
				GITHUB_ORG: "My-Production-Org",
				GITHUB_ORG_NONPROD: "Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("My-Production-Org");
		});

		it("should return 'Jolli-Sites' fallback when SITE_ENV is 'prod' and no GITHUB_ORG", () => {
			const mockConfig = {
				SITE_ENV: "prod",
				GITHUB_ORG: "",
				GITHUB_ORG_NONPROD: "Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("Jolli-Sites");
		});

		it("should return 'Jolli-Sites' fallback when GITHUB_ORG is undefined in prod", () => {
			const mockConfig = {
				SITE_ENV: "prod",
				GITHUB_ORG_NONPROD: "Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			expect(getGitHubOrg(mockConfig)).toBe("Jolli-Sites");
		});
	});

	describe("validateGitHubOrgAccess", () => {
		it("should skip validation when GITHUB_TOKEN is not configured", async () => {
			const mockConfig = {
				GITHUB_TOKEN: "",
				SITE_ENV: "local",
				GITHUB_ORG_NONPROD: "Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			// Should not throw
			await expect(validateGitHubOrgAccess(mockConfig)).resolves.toBeUndefined();
		});

		it("should skip validation when GITHUB_TOKEN is undefined", async () => {
			const mockConfig = {
				SITE_ENV: "local",
				GITHUB_ORG_NONPROD: "Sample-Repos",
			} as ReturnType<typeof import("../config/Config").getConfig>;

			// Should not throw
			await expect(validateGitHubOrgAccess(mockConfig)).resolves.toBeUndefined();
		});
	});
});
