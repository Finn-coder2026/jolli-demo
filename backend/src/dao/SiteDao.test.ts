import type { Doc } from "../model/Doc";
import type { NewSite, Site } from "../model/Site";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createSiteDao, createSiteDaoProvider, type SiteDao } from "./SiteDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SiteDao", () => {
	let mockNewDocsites: ModelDef<Site>;
	let mockDocs: ModelDef<Doc>;
	let siteDao: SiteDao;
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockNewDocsites = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Site>;

		mockDocs = {
			findOne: vi.fn(),
			findAll: vi.fn(),
		} as unknown as ModelDef<Doc>;

		mockSequelize = {
			define: vi.fn((modelName: string) => {
				if (modelName === "sites") {
					return mockNewDocsites;
				}
				if (modelName === "doc") {
					return mockDocs;
				}
				throw new Error(`Unexpected model: ${modelName}`);
			}),
			fn: vi.fn((fn: string, col: unknown) => `${fn}(${col})`),
			col: vi.fn((col: string) => col),
			where: vi.fn((left: unknown, right: unknown) => ({ left, right })),
			literal: vi.fn((sql: string) => sql),
		} as unknown as Sequelize;

		siteDao = createSiteDao(mockSequelize);
	});

	describe("createSite", () => {
		it("should create a site", async () => {
			const newDocsite: NewSite = {
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
			};

			const createdDocsite: Site = {
				...newDocsite,
				id: 1,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(createdDocsite),
			};

			vi.mocked(mockNewDocsites.create).mockResolvedValue(mockInstance as never);

			const result = await siteDao.createSite(newDocsite);

			expect(mockNewDocsites.create).toHaveBeenCalledWith(newDocsite);
			expect(mockInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdDocsite);
		});

		it("should create docsite with metadata", async () => {
			const newDocsite: NewSite = {
				name: "full-site",
				displayName: "Full Site",
				userId: 2,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "Jolli-sample-repos/test-site",
					githubUrl: "https://github.com/Jolli-sample-repos/test-site",
					vercelUrl: "https://test-site.vercel.app",
					framework: "docusaurus-2",
					articleCount: 3,
					lastDeployedAt: "2024-01-15T10:00:00Z",
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const createdDocsite: Site = {
				...newDocsite,
				id: 2,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(createdDocsite),
			};

			vi.mocked(mockNewDocsites.create).mockResolvedValue(mockInstance as never);

			const result = await siteDao.createSite(newDocsite);

			expect(result).toEqual(createdDocsite);
			expect(result.metadata?.githubRepo).toBe("Jolli-sample-repos/test-site");
		});
	});

	describe("getSite", () => {
		it("should get docsite by id", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

			const result = await siteDao.getSite(1);

			expect(mockNewDocsites.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(docsite);
		});

		it("should return undefined when docsite not found", async () => {
			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(null);

			const result = await siteDao.getSite(999);

			expect(result).toBeUndefined();
		});
	});

	describe("getSiteByName", () => {
		it("should get docsite by name", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findOne).mockResolvedValue(mockInstance as never);

			const result = await siteDao.getSiteByName("test-site");

			expect(mockNewDocsites.findOne).toHaveBeenCalledWith({ where: { name: "test-site" } });
			expect(result).toEqual(docsite);
		});

		it("should return undefined when docsite not found by name", async () => {
			vi.mocked(mockNewDocsites.findOne).mockResolvedValue(null);

			const result = await siteDao.getSiteByName("nonexistent");

			expect(result).toBeUndefined();
		});
	});

	describe("listSites", () => {
		it("should list all docsites ordered by creation date", async () => {
			const docsites: Array<Site> = [
				{
					id: 2,
					name: "site-2",
					displayName: "Site 2",
					userId: 1,
					status: "active",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-16T10:00:00Z"),
					updatedAt: new Date("2024-01-16T10:00:00Z"),
				},
				{
					id: 1,
					name: "site-1",
					displayName: "Site 1",
					userId: 1,
					status: "pending",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedAt: new Date("2024-01-15T10:00:00Z"),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await siteDao.listSites();

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({ order: [["createdAt", "DESC"]] });
			expect(result).toEqual(docsites);
		});

		it("should return empty array when no docsites exist", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const result = await siteDao.listSites();

			expect(result).toEqual([]);
		});
	});

	describe("listSitesByUser", () => {
		it("should list docsites for specific user", async () => {
			const docsites: Array<Site> = [
				{
					id: 1,
					name: "user-1-site-1",
					displayName: "User 1 Site 1",
					userId: 1,
					status: "active",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedAt: new Date("2024-01-15T10:00:00Z"),
				},
				{
					id: 2,
					name: "user-1-site-2",
					displayName: "User 1 Site 2",
					userId: 1,
					status: "pending",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-16T10:00:00Z"),
					updatedAt: new Date("2024-01-16T10:00:00Z"),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await siteDao.listSitesByUser(1);

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({
				where: { userId: 1 },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});

		it("should return empty array when user has no docsites", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const result = await siteDao.listSitesByUser(999);

			expect(result).toEqual([]);
		});
	});

	describe("listSitesByStatus", () => {
		it("should list docsites by status", async () => {
			const docsites: Array<Site> = [
				{
					id: 1,
					name: "active-site-1",
					displayName: "Active Site 1",
					userId: 1,
					status: "active",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedAt: new Date("2024-01-15T10:00:00Z"),
				},
				{
					id: 2,
					name: "active-site-2",
					displayName: "Active Site 2",
					userId: 2,
					status: "active",
					visibility: "internal",
					metadata: undefined,
					lastGeneratedAt: undefined,
					createdAt: new Date("2024-01-16T10:00:00Z"),
					updatedAt: new Date("2024-01-16T10:00:00Z"),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await siteDao.listSitesByStatus("active");

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({
				where: { status: "active" },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});

		it("should list pending docsites", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const _result = await siteDao.listSitesByStatus("pending");

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({
				where: { status: "pending" },
				order: [["createdAt", "DESC"]],
			});
		});

		it("should list building docsites", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const _result = await siteDao.listSitesByStatus("building");

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({
				where: { status: "building" },
				order: [["createdAt", "DESC"]],
			});
		});

		it("should list error docsites", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const _result = await siteDao.listSitesByStatus("error");

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith({
				where: { status: "error" },
				order: [["createdAt", "DESC"]],
			});
		});
	});

	describe("updateSite", () => {
		it("should update existing docsite", async () => {
			const existingDocsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const updatedDocsite: Site = {
				...existingDocsite,
				status: "active",
				metadata: {
					githubRepo: "Jolli-sample-repos/test-site",
					githubUrl: "https://github.com/Jolli-sample-repos/test-site",
					vercelUrl: "https://test-site.vercel.app",
					framework: "docusaurus-2",
					articleCount: 0,
				},
			};

			const mockExistingInstance = {
				get: vi.fn().mockReturnValue(existingDocsite),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedDocsite),
			};

			vi.mocked(mockNewDocsites.findByPk)
				.mockResolvedValueOnce(mockExistingInstance as never)
				.mockResolvedValueOnce(mockUpdatedInstance as never);

			vi.mocked(mockNewDocsites.update).mockResolvedValue([1]);

			const result = await siteDao.updateSite(updatedDocsite);

			expect(mockNewDocsites.findByPk).toHaveBeenCalledWith(1);
			expect(mockNewDocsites.update).toHaveBeenCalledWith(updatedDocsite, { where: { id: 1 } });
			expect(result).toEqual(updatedDocsite);
		});

		it("should return undefined when docsite does not exist", async () => {
			const nonExistentDocsite: Site = {
				id: 999,
				name: "nonexistent",
				displayName: "Nonexistent",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(null);

			const result = await siteDao.updateSite(nonExistentDocsite);

			expect(result).toBeUndefined();
			expect(mockNewDocsites.update).not.toHaveBeenCalled();
		});
	});

	describe("deleteSite", () => {
		it("should delete docsite by id", async () => {
			vi.mocked(mockNewDocsites.destroy).mockResolvedValue(1);

			await siteDao.deleteSite(1);

			expect(mockNewDocsites.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
		});

		it("should handle deleting non-existent docsite", async () => {
			vi.mocked(mockNewDocsites.destroy).mockResolvedValue(0);

			await siteDao.deleteSite(999);

			expect(mockNewDocsites.destroy).toHaveBeenCalledWith({ where: { id: 999 } });
		});
	});

	describe("deleteAllSites", () => {
		it("should delete all docsites", async () => {
			vi.mocked(mockNewDocsites.destroy).mockResolvedValue(5);

			await siteDao.deleteAllSites();

			expect(mockNewDocsites.destroy).toHaveBeenCalledWith({ where: {} });
		});

		it("should work when no docsites exist", async () => {
			vi.mocked(mockNewDocsites.destroy).mockResolvedValue(0);

			await siteDao.deleteAllSites();

			expect(mockNewDocsites.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("checkIfNeedsUpdate", () => {
		it("should return false when docsite is pending (not yet generated)", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(false);
		});

		it("should return false when docsite is building", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "building",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(false);
		});

		it("should return false when docsite does not exist", async () => {
			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(null);

			const result = await siteDao.checkIfNeedsUpdate(999);

			expect(result).toBe(false);
		});

		it("should return true when docsite never generated and status is error", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "error",
				visibility: "internal",
				metadata: undefined,
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should return true when articles updated after last generation", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:test"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:test", updatedAt: new Date("2024-01-16T12:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should return false when no articles updated since last generation", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:test"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:test", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(false);
		});

		it("should return false when no articles exist and none were generated", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 0,
					generatedArticleJrns: [],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(false);
		});

		it("should return true when article was deleted", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:deleted"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should return true when new article was added", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:old"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:old", updatedAt: new Date("2024-01-15T09:00:00Z") },
				{ jrn: "article:new", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should return true when article was deleted but others remain", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 2,
					generatedArticleJrns: ["article:existing", "article:deleted"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// Only return article:existing - article:deleted has been removed
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:existing", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should treat missing generatedArticleJrns as empty array (backward compat)", async () => {
			// This test covers the case where a site was generated before the
			// generatedArticleJrns field was added to metadata
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					// Note: no generatedArticleJrns field
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// Article exists but was modified before lastGeneratedAt - no change
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:existing", updatedAt: new Date("2024-01-14T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			// Should return true because article is treated as NEW (not in generatedArticleJrns)
			expect(result).toBe(true);
		});

		it("should exclude /root documents when checking for updates", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:test"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// Return regular article (not modified) and /root article (modified after lastGeneratedAt)
			// The /root article should be excluded, so no update should be needed
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:test", updatedAt: new Date("2024-01-15T09:00:00Z") },
				{ jrn: "/root/system-doc", updatedAt: new Date("2024-01-17T12:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			// Should return false because /root docs are excluded
			expect(result).toBe(false);
		});
	});

	describe("getChangedArticles", () => {
		it("should return empty array when site does not exist", async () => {
			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(null);

			const result = await siteDao.getChangedArticles(999);

			expect(result).toEqual([]);
		});

		it("should return all selected articles as new when site has never been generated", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: undefined, // No selectedArticleJrns = include-all mode
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Mock articles that exist in the database
			const docs: Array<Doc> = [
				{
					id: 1,
					jrn: "article:getting-started",
					slug: "getting-started",
					path: "",
					content: "content",
					contentType: "mdx",
					contentMetadata: { title: "Getting Started" },
					updatedAt: new Date("2024-01-15T10:00:00Z"),
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedBy: "test",
					source: undefined,
					sourceMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: "test",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
				{
					id: 2,
					jrn: "article:hello-world",
					slug: "hello-world",
					path: "",
					content: "content",
					contentType: "mdx",
					contentMetadata: { title: "Hello World" },
					updatedAt: new Date("2024-01-15T10:00:00Z"),
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedBy: "test",
					source: undefined,
					sourceMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: "test",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(
				docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
			);

			const result = await siteDao.getChangedArticles(1);

			// All articles should be returned as "new" since site has never been built
			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({
				jrn: "article:getting-started",
				changeType: "new",
				changeReason: "content", // Include-all mode uses "content" as reason
			});
			expect(result[1]).toMatchObject({
				jrn: "article:hello-world",
				changeType: "new",
				changeReason: "content",
			});
		});

		it("should return empty array when site never generated and has zero articles selected", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "pending",
				visibility: "internal",
				metadata: {
					githubRepo: "Jolli-sample-repos/test-site",
					githubUrl: "https://github.com/Jolli-sample-repos/test-site",
					framework: "nextra-4",
					articleCount: 0,
					selectedArticleJrns: [], // Zero articles selected
				},
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Mock articles that exist in the database (but none are selected)
			const docs: Array<Doc> = [
				{
					id: 1,
					jrn: "article:getting-started",
					slug: "getting-started",
					path: "",
					content: "content",
					contentType: "mdx",
					contentMetadata: { title: "Getting Started" },
					updatedAt: new Date("2024-01-15T10:00:00Z"),
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedBy: "test",
					source: undefined,
					sourceMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: "test",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(
				docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
			);

			const result = await siteDao.getChangedArticles(1);

			// No articles should be returned since selection is empty
			expect(result).toEqual([]);
		});

		it("should return only selected articles as new when site never generated with specific selection", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "error", // Failed build
				visibility: "internal",
				metadata: {
					githubRepo: "Jolli-sample-repos/test-site",
					githubUrl: "https://github.com/Jolli-sample-repos/test-site",
					framework: "nextra-4",
					articleCount: 0,
					selectedArticleJrns: ["article:getting-started"], // Only one selected
				},
				lastGeneratedAt: undefined,
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Mock articles that exist in the database
			const docs: Array<Doc> = [
				{
					id: 1,
					jrn: "article:getting-started",
					slug: "getting-started",
					path: "",
					content: "content",
					contentType: "mdx",
					contentMetadata: { title: "Getting Started" },
					updatedAt: new Date("2024-01-15T10:00:00Z"),
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedBy: "test",
					source: undefined,
					sourceMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: "test",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
				{
					id: 2,
					jrn: "article:hello-world",
					slug: "hello-world",
					path: "",
					content: "content",
					contentType: "mdx",
					contentMetadata: { title: "Hello World" },
					updatedAt: new Date("2024-01-15T10:00:00Z"),
					createdAt: new Date("2024-01-15T10:00:00Z"),
					updatedBy: "test",
					source: undefined,
					sourceMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document",
					sortOrder: 0,
					createdBy: "test",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(
				docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
			);

			const result = await siteDao.getChangedArticles(1);

			// Only the selected article should be returned as "new"
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				jrn: "article:getting-started",
				changeType: "new",
				changeReason: "selection", // Specific selection mode uses "selection" as reason
			});
		});

		it("should return changed articles with their metadata and changeType", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:getting-started"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			const changedDocs = [
				{
					id: 1,
					jrn: "article:getting-started",
					updatedAt: new Date("2024-01-16T12:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "Getting Started" },
				},
				{
					id: 2,
					jrn: "article:api-reference",
					updatedAt: new Date("2024-01-16T11:00:00Z"),
					contentType: "application/json",
					contentMetadata: { title: "API Reference" },
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toEqual([
				{
					id: 1,
					title: "Getting Started",
					jrn: "article:getting-started",
					updatedAt: "2024-01-16T12:00:00.000Z",
					contentType: "text/markdown",
					changeType: "updated",
					changeReason: "content",
				},
				{
					id: 2,
					title: "API Reference",
					jrn: "article:api-reference",
					updatedAt: "2024-01-16T11:00:00.000Z",
					contentType: "application/json",
					changeType: "new",
					changeReason: "content",
				},
			]);
		});

		it("should use jrn as title when contentMetadata.title is missing (new article)", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 0,
					generatedArticleJrns: [],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			const changedDocs = [
				{
					id: 1,
					jrn: "article:untitled-doc",
					updatedAt: new Date("2024-01-16T12:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: undefined,
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toEqual([
				{
					id: 1,
					title: "article:untitled-doc",
					jrn: "article:untitled-doc",
					updatedAt: "2024-01-16T12:00:00.000Z",
					contentType: "text/markdown",
					changeType: "new",
					changeReason: "content",
				},
			]);
		});

		it("should use jrn as title when contentMetadata.title is missing (updated article)", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:untitled-doc"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			const changedDocs = [
				{
					id: 1,
					jrn: "article:untitled-doc",
					updatedAt: new Date("2024-01-16T12:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: undefined,
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toEqual([
				{
					id: 1,
					title: "article:untitled-doc",
					jrn: "article:untitled-doc",
					updatedAt: "2024-01-16T12:00:00.000Z",
					contentType: "text/markdown",
					changeType: "updated",
					changeReason: "content",
				},
			]);
		});

		it("should return deleted articles with stored title when generatedArticleTitles exists", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:deleted-doc"],
					generatedArticleTitles: { "article:deleted-doc": "My Deleted Article" },
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([] as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: -1,
				title: "My Deleted Article",
				jrn: "article:deleted-doc",
				contentType: "unknown",
				changeType: "deleted",
				changeReason: "content",
			});
		});

		it("should fall back to JRN as title when generatedArticleTitles is missing (backward compat)", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:deleted-doc"],
					// No generatedArticleTitles - old site format
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue([] as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: -1,
				title: "article:deleted-doc",
				jrn: "article:deleted-doc",
				contentType: "unknown",
				changeType: "deleted",
				changeReason: "content",
			});
		});

		it("should treat soft-deleted articles as deleted, not updated", async () => {
			// A soft-deleted article (deletedAt is set) should be filtered out of currentDocs
			// and appear as "deleted" — not "updated" due to its updatedAt changing during soft-delete
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 2,
					generatedArticleJrns: ["article:existing", "article:soft-deleted"],
					generatedArticleTitles: { "article:existing": "Existing", "article:soft-deleted": "Soft Deleted" },
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = { get: vi.fn().mockReturnValue(docsite) };
			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);

			// The soft-deleted article is excluded by the deletedAt filter in the query,
			// so mockDocs.findAll only returns the existing article
			const docs = [
				{
					id: 1,
					jrn: "article:existing",
					updatedAt: new Date("2024-01-14T10:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "Existing" },
				},
			];
			vi.mocked(mockDocs.findAll).mockResolvedValue(
				docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
			);

			const result = await siteDao.getChangedArticles(1);

			// The soft-deleted article should appear as "deleted", not "updated"
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				jrn: "article:soft-deleted",
				changeType: "deleted",
				title: "Soft Deleted",
			});
		});

		it("should return empty array when no articles changed", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:test"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Article exists and was not updated after lastGeneratedAt
			const changedDocs = [
				{
					id: 1,
					jrn: "article:test",
					updatedAt: new Date("2024-01-15T09:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "Test" },
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			expect(result).toEqual([]);
		});

		it("should handle missing generatedArticleJrns (backward compat)", async () => {
			// This test covers the case where a site was generated before the
			// generatedArticleJrns field was added to metadata
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					// Note: no generatedArticleJrns field
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Article updated after lastGeneratedAt - should be detected as updated
			const changedDocs = [
				{
					id: 1,
					jrn: "article:test",
					updatedAt: new Date("2024-01-16T09:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "Test" },
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			// Article should be detected as "new" since generatedArticleJrns is empty
			expect(result).toEqual([
				{
					id: 1,
					title: "Test",
					jrn: "article:test",
					updatedAt: "2024-01-16T09:00:00.000Z",
					contentType: "text/markdown",
					changeType: "new",
					changeReason: "content",
				},
			]);
		});

		it("should exclude /root documents from changed articles", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:test"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			// Include both regular articles and /root articles
			const changedDocs = [
				{
					id: 1,
					jrn: "article:test",
					updatedAt: new Date("2024-01-16T12:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "Test" },
				},
				{
					id: 2,
					jrn: "/root/system-doc",
					updatedAt: new Date("2024-01-16T12:00:00Z"),
					contentType: "text/markdown",
					contentMetadata: { title: "System Doc" },
				},
			];

			const mockDocInstances = changedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getChangedArticles(1);

			// Should only include the regular article, not the /root one
			expect(result).toEqual([
				{
					id: 1,
					title: "Test",
					jrn: "article:test",
					updatedAt: "2024-01-16T12:00:00.000Z",
					contentType: "text/markdown",
					changeType: "updated",
					changeReason: "content",
				},
			]);
		});
	});

	describe("getArticlesForSite", () => {
		it("should return empty array when site does not exist", async () => {
			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(null);

			const result = await siteDao.getArticlesForSite(999);

			expect(result).toEqual([]);
		});

		it("should return all articles when selectedArticleJrns is undefined (include all mode)", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 2,
					// No selectedArticleJrns - include all mode
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			const allDocs = [
				{ id: 1, jrn: "article:one", updatedAt: new Date("2024-01-15T09:00:00Z"), content: "test content 1" },
				{ id: 2, jrn: "article:two", updatedAt: new Date("2024-01-15T08:00:00Z"), content: "test content 2" },
			];

			const mockDocInstances = allDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getArticlesForSite(1);

			// Content should be stripped (jolliscript frontmatter removed, but these don't have any)
			expect(result).toEqual(allDocs);
			// Should have called findAll with deletedAt filter (no JRN filter), ordered by parentId then sortOrder
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ deletedAt: expect.anything() }),
					order: [
						["parentId", "ASC"],
						["sortOrder", "ASC"],
					],
				}),
			);
		});

		it("should return empty array when selectedArticleJrns is empty array (zero articles)", async () => {
			// Empty array means "zero articles selected", NOT "include all"
			// This allows users to create sites with no content (placeholder page)
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 0,
					selectedArticleJrns: [], // Empty array = zero articles selected
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);

			const result = await siteDao.getArticlesForSite(1);

			// Should return empty array without querying for docs
			expect(result).toEqual([]);
			expect(mockDocs.findAll).not.toHaveBeenCalled();
		});

		it("should return only selected articles when selectedArticleJrns has values", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					selectedArticleJrns: ["article:selected-one", "article:selected-two"],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockSiteInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			const selectedDocs = [
				{
					id: 1,
					jrn: "article:selected-one",
					updatedAt: new Date("2024-01-15T09:00:00Z"),
					content: "selected content 1",
				},
				{
					id: 2,
					jrn: "article:selected-two",
					updatedAt: new Date("2024-01-15T08:00:00Z"),
					content: "selected content 2",
				},
			];

			const mockDocInstances = selectedDocs.map(doc => ({
				get: vi.fn().mockReturnValue(doc),
			}));

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockSiteInstance as never);
			vi.mocked(mockDocs.findAll).mockResolvedValue(mockDocInstances as never);

			const result = await siteDao.getArticlesForSite(1);

			expect(result).toEqual(selectedDocs);
			// Should have called findAll with a where clause filtering by JRNs, ordered by parentId then sortOrder
			expect(mockDocs.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						jrn: expect.anything(),
					}),
					order: [
						["parentId", "ASC"],
						["sortOrder", "ASC"],
					],
				}),
			);
		});
	});

	describe("checkIfNeedsUpdate with selectedArticleJrns", () => {
		it("should only check selected articles when selectedArticleJrns is set", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:selected"],
					selectedArticleJrns: ["article:selected"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// Selected article not updated - should return false
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:selected", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(false);
		});

		it("should detect new article added to selection", async () => {
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 1,
					generatedArticleJrns: ["article:old"],
					selectedArticleJrns: ["article:old", "article:new"],
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// New article added to selection
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:old", updatedAt: new Date("2024-01-15T09:00:00Z") },
				{ jrn: "article:new", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			expect(result).toBe(true);
		});

		it("should detect change when article is deselected (needs to be removed from site)", async () => {
			// Deselecting an article IS a change that triggers update
			// The article needs to be removed from the generated site
			const docsite: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: 2,
					generatedArticleJrns: ["article:one", "article:two"],
					selectedArticleJrns: ["article:one"], // article:two deselected but still exists
				},
				lastGeneratedAt: new Date("2024-01-16T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
			// Both articles still exist in DB
			vi.mocked(mockDocs.findAll).mockResolvedValue([
				{ jrn: "article:one", updatedAt: new Date("2024-01-15T09:00:00Z") },
				{ jrn: "article:two", updatedAt: new Date("2024-01-15T09:00:00Z") },
			] as never);

			const result = await siteDao.checkIfNeedsUpdate(1);

			// Update needed - deselected article needs to be removed from site
			expect(result).toBe(true);
		});
	});

	/**
	 * Article Synchronization Test Matrix
	 *
	 * This section covers all combinations of article changes to ensure proper
	 * synchronization between articles, repository files, and _meta.js navigation.
	 *
	 * Change Types:
	 * 1. SELECTION CHANGES (user changes which articles are selected for site)
	 *    - Add article to selection
	 *    - Remove article from selection
	 *    - Switch from "include all" to "specific selection"
	 *    - Switch from "specific selection" to "include all"
	 *
	 * 2. SOURCE CHANGES (articles in database change)
	 *    - New article created in DB
	 *    - Article content updated in DB
	 *    - Article deleted from DB
	 *
	 * 3. COMBINED SCENARIOS
	 *    - Selection change + source change simultaneously
	 *    - Multiple articles with different change types
	 *
	 * Expected Outcomes:
	 * - checkIfNeedsUpdate returns true/false correctly
	 * - getChangedArticles returns correct changeType (new/updated/deleted)
	 * - getChangedArticles returns correct changeReason (content/selection)
	 */
	describe("Article Sync Test Matrix", () => {
		// Helper to create a test site with customizable state
		function createTestSite(overrides: {
			selectedArticleJrns?: Array<string>;
			generatedArticleJrns?: Array<string>;
			generatedArticleTitles?: Record<string, string>;
			lastGeneratedAt?: Date;
			status?: "pending" | "building" | "active" | "error";
		}): Site {
			return {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: overrides.status || "active",
				visibility: "internal",
				metadata: {
					githubRepo: "test/repo",
					githubUrl: "https://github.com/test/repo",
					framework: "nextra",
					articleCount: overrides.generatedArticleJrns?.length || 0,
					generatedArticleJrns: overrides.generatedArticleJrns || [],
					selectedArticleJrns: overrides.selectedArticleJrns || [],
					...(overrides.generatedArticleTitles
						? { generatedArticleTitles: overrides.generatedArticleTitles }
						: {}),
				},
				lastGeneratedAt: overrides.lastGeneratedAt || new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};
		}

		describe("Selection Changes", () => {
			describe("Add article to selection", () => {
				it("should detect when article is added to selection (checkIfNeedsUpdate)", async () => {
					// Setup: Site with article:a generated, now article:b added to selection
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a"],
						selectedArticleJrns: ["article:a", "article:b"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true);
				});

				it("should return new changeType for article added to selection (getChangedArticles)", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a"],
						selectedArticleJrns: ["article:a", "article:b"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:a",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article A" },
						},
						{
							id: 2,
							jrn: "article:b",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article B" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					// article:b should be "new" (added to selection) with changeReason "selection"
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:b", changeType: "new", changeReason: "selection" }),
					);
					// article:a should not be in changed list (no change)
					expect(result.find(r => r.jrn === "article:a")).toBeUndefined();
				});
			});

			describe("Deselect article (article still exists in DB)", () => {
				it("should detect change when article is deselected but still exists in DB", async () => {
					// Deselecting an article IS a change - article needs to be removed from site
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a", "article:b"],
						selectedArticleJrns: ["article:a"], // article:b deselected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Both articles still exist in DB
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") }, // Still exists but deselected
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					// Deselected article needs to be removed from site on rebuild
					expect(result).toBe(true);
				});

				it("should return deselected article as 'deleted' in getChangedArticles", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a", "article:b"],
						selectedArticleJrns: ["article:a"], // article:b deselected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:a",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article A" },
						},
						{
							id: 2,
							jrn: "article:b",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article B" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					// Deselected article SHOULD appear as "deleted" since it needs to be removed from site
					const deselectedArticle = result.find(r => r.jrn === "article:b");
					expect(deselectedArticle).toBeDefined();
					expect(deselectedArticle?.changeType).toBe("deleted");
					expect(deselectedArticle?.changeReason).toBe("selection");
				});
			});

			describe("Switch from include-all to specific selection", () => {
				it("should detect change when switching to specific selection (deselected articles)", async () => {
					// Deselecting articles IS a change - deselected articles need to be removed from site
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a", "article:b", "article:c"],
						selectedArticleJrns: ["article:a", "article:b"], // c deselected but still exists
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// All 3 articles still exist in DB
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:c", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true); // article:c is deselected and needs to be removed from site
				});
			});

			describe("Switch from specific selection to include-all", () => {
				it("should detect new article when switching to include-all (more articles)", async () => {
					// Site was using specific selection with 2 articles
					// Now switching to include-all (undefined) which has 3 articles
					// article:c is NEW (not in generatedArticleJrns)
					const docsite: Site = {
						id: 1,
						name: "test-site",
						displayName: "Test Site",
						userId: 1,
						status: "active",
						visibility: "internal",
						metadata: {
							githubRepo: "test/repo",
							githubUrl: "https://github.com/test/repo",
							framework: "nextra",
							articleCount: 2,
							generatedArticleJrns: ["article:a", "article:b"],
							// selectedArticleJrns: undefined = include all
						},
						lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
						createdAt: new Date("2024-01-15T10:00:00Z"),
						updatedAt: new Date("2024-01-15T10:00:00Z"),
					};

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// All 3 articles exist in DB - article:c is NEW
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:c", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					// Should need update because article:c is NEW (not in generatedArticleJrns)
					expect(result).toBe(true);
				});
			});
		});

		describe("Source Changes (DB article changes)", () => {
			describe("New article created in DB", () => {
				it("should detect new article in include-all mode", async () => {
					// Site uses include-all, new article created in DB
					const docsite: Site = {
						id: 1,
						name: "test-site",
						displayName: "Test Site",
						userId: 1,
						status: "active",
						visibility: "internal",
						metadata: {
							githubRepo: "test/repo",
							githubUrl: "https://github.com/test/repo",
							framework: "nextra",
							articleCount: 1,
							generatedArticleJrns: ["article:existing"],
							// No selectedArticleJrns = include all
						},
						lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
						createdAt: new Date("2024-01-15T10:00:00Z"),
						updatedAt: new Date("2024-01-15T10:00:00Z"),
					};

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Both articles exist in DB - article:new is NEW
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:existing", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:new", updatedAt: new Date("2024-01-16T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true);
				});

				it("should NOT detect new article when not in specific selection", async () => {
					// Unselected articles should NOT be detected as new - they are intentionally excluded
					// This prevents deselected articles from appearing as "new" after rebuild
					const docsite = createTestSite({
						generatedArticleJrns: ["article:selected"],
						selectedArticleJrns: ["article:selected"], // Only this article selected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Return selected article + unselected article
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:selected", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:unselected", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(false); // Unselected articles don't trigger updates
				});

				it("should NOT return unselected article in getChangedArticles", async () => {
					// Unselected articles should NOT appear in changed articles
					const docsite = createTestSite({
						generatedArticleJrns: ["article:selected"],
						selectedArticleJrns: ["article:selected"], // Only this article selected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:selected",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Selected Article" },
						},
						{
							id: 2,
							jrn: "article:unselected",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Unselected Article" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					// Unselected article should NOT appear in changed list
					expect(result.find(r => r.jrn === "article:unselected")).toBeUndefined();
					// Selected article has no change either
					expect(result.find(r => r.jrn === "article:selected")).toBeUndefined();
				});

				it("should detect new article when it IS selected", async () => {
					// Newly selected articles (not yet generated) should be detected as new
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a"],
						selectedArticleJrns: ["article:a", "article:newly-selected"], // New article added to selection
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:newly-selected", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true); // Newly selected article needs to be generated
				});
			});

			describe("Article content updated in DB", () => {
				it("should detect update to selected article", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a"],
						selectedArticleJrns: ["article:a"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Article updated after lastGeneratedAt
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-16T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true);
				});

				it("should return updated changeType for modified article", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a"],
						selectedArticleJrns: ["article:a"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:a",
							updatedAt: new Date("2024-01-16T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article A Updated" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					expect(result).toContainEqual(expect.objectContaining({ jrn: "article:a", changeType: "updated" }));
				});

				it("should detect deselection even if article was updated (deselection takes precedence)", async () => {
					// When an article is deselected from a site, it triggers a change
					// even if the article was also updated - because it needs to be removed from site
					const docsite = createTestSite({
						generatedArticleJrns: ["article:selected", "article:deselected"],
						selectedArticleJrns: ["article:selected"], // article:deselected was deselected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Both articles exist, deselected one is updated but since it's deselected,
					// it needs to be removed from site - triggering a change
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:selected", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:deselected", updatedAt: new Date("2024-01-16T10:00:00Z") }, // Updated but deselected
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true); // Deselected article needs to be removed
				});

				it("should NOT detect update to never-generated article outside selection", async () => {
					// An article that was never generated and is not selected shouldn't trigger update
					const docsite = createTestSite({
						generatedArticleJrns: ["article:selected"],
						selectedArticleJrns: ["article:selected"], // Only selected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// article:other exists in DB but was never generated and not selected
					// It shouldn't trigger a change - unselected articles are intentionally excluded
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:selected", updatedAt: new Date("2024-01-14T10:00:00Z") },
						{ jrn: "article:other", updatedAt: new Date("2024-01-16T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					// Unselected articles don't trigger updates, even if they exist in DB
					expect(result).toBe(false);
				});
			});

			describe("Article deleted from DB", () => {
				it("should detect deletion of selected article", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a", "article:deleted"],
						selectedArticleJrns: ["article:a", "article:deleted"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// article:deleted no longer exists in DB
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true);
				});

				it("should return deleted changeType for DB-deleted article", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:a", "article:deleted"],
						selectedArticleJrns: ["article:a", "article:deleted"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:a",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Article A" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:deleted", changeType: "deleted" }),
					);
				});

				it("should detect deselected article even if also deleted from DB", async () => {
					// A previously generated article that was deselected triggers a change
					// (regardless of whether it was also deleted from DB)
					const docsite = createTestSite({
						generatedArticleJrns: ["article:selected", "article:deselected-and-deleted"],
						selectedArticleJrns: ["article:selected"], // deselected-and-deleted was deselected
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// article:deselected-and-deleted is gone from DB AND was deselected
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:selected", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true); // Article was generated and is now gone - needs removal from site
				});

				it("should detect deletion in include-all mode", async () => {
					// Site uses include-all, article deleted from DB
					const docsite: Site = {
						id: 1,
						name: "test-site",
						displayName: "Test Site",
						userId: 1,
						status: "active",
						visibility: "internal",
						metadata: {
							githubRepo: "test/repo",
							githubUrl: "https://github.com/test/repo",
							framework: "nextra",
							articleCount: 2,
							generatedArticleJrns: ["article:a", "article:deleted"],
							// No selectedArticleJrns = include all
						},
						lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
						createdAt: new Date("2024-01-15T10:00:00Z"),
						updatedAt: new Date("2024-01-15T10:00:00Z"),
					};

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
					// Only article:a exists now - article:deleted was deleted from DB
					vi.mocked(mockDocs.findAll).mockResolvedValue([
						{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
					] as never);

					const result = await siteDao.checkIfNeedsUpdate(1);
					expect(result).toBe(true);
				});
			});
		});

		describe("Combined Scenarios", () => {
			describe("Add article to selection + article updated", () => {
				it("should detect both new and updated articles", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:existing"],
						selectedArticleJrns: ["article:existing", "article:new"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:existing",
							updatedAt: new Date("2024-01-16T10:00:00Z"), // Updated
							contentType: "text/markdown",
							contentMetadata: { title: "Existing Updated" },
						},
						{
							id: 2,
							jrn: "article:new",
							updatedAt: new Date("2024-01-14T10:00:00Z"), // New to selection
							contentType: "text/markdown",
							contentMetadata: { title: "New Article" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:existing", changeType: "updated" }),
					);
					expect(result).toContainEqual(expect.objectContaining({ jrn: "article:new", changeType: "new" }));
				});
			});

			describe("Deselect article + another article updated", () => {
				it("should detect both updated and deselected articles", async () => {
					// Deselecting IS a change - deselected articles need to be removed from site
					const docsite = createTestSite({
						generatedArticleJrns: ["article:keep", "article:deselected"],
						selectedArticleJrns: ["article:keep"], // article:deselected deselected but exists
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:keep",
							updatedAt: new Date("2024-01-16T10:00:00Z"), // Updated
							contentType: "text/markdown",
							contentMetadata: { title: "Keep Updated" },
						},
						{
							id: 2,
							jrn: "article:deselected",
							updatedAt: new Date("2024-01-14T10:00:00Z"), // Still exists in DB
							contentType: "text/markdown",
							contentMetadata: { title: "Deselected" },
						},
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					// Updated article should be returned
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:keep", changeType: "updated" }),
					);
					// Deselected article SHOULD appear as deleted (needs to be removed from site)
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:deselected", changeType: "deleted" }),
					);
				});
			});

			describe("Article deleted from DB + another added to selection", () => {
				it("should detect deleted (from DB) and new (to selection) articles", async () => {
					const docsite = createTestSite({
						generatedArticleJrns: ["article:old", "article:deleted-from-db"],
						selectedArticleJrns: ["article:old", "article:deleted-from-db", "article:newly-selected"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:old",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Old Article" },
						},
						{
							id: 3,
							jrn: "article:newly-selected",
							updatedAt: new Date("2024-01-14T10:00:00Z"),
							contentType: "text/markdown",
							contentMetadata: { title: "Newly Selected" },
						},
						// article:deleted-from-db doesn't exist in DB anymore
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:newly-selected", changeType: "new" }),
					);
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:deleted-from-db", changeType: "deleted" }),
					);
					// article:old should not be in the list (no change)
					expect(result.find(r => r.jrn === "article:old")).toBeUndefined();
				});
			});

			describe("Multiple change types simultaneously", () => {
				it("should correctly categorize all change types (new, updated, deleted, deselected)", async () => {
					// Test scenario:
					// - article:updated: was generated, is selected, was updated
					// - article:new: NOT in generated, is selected (NEW)
					// - article:db-deleted: was generated, was selected, deleted from DB
					// - article:deselected: was generated, deselected but still exists (shows as deleted)
					const docsite = createTestSite({
						generatedArticleJrns: ["article:updated", "article:deselected", "article:db-deleted"],
						selectedArticleJrns: ["article:updated", "article:new", "article:db-deleted"],
					});

					const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
					vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

					const docs = [
						{
							id: 1,
							jrn: "article:updated",
							updatedAt: new Date("2024-01-16T10:00:00Z"), // Updated after generation
							contentType: "text/markdown",
							contentMetadata: { title: "Updated Article" },
						},
						{
							id: 2,
							jrn: "article:new",
							updatedAt: new Date("2024-01-14T10:00:00Z"), // New article
							contentType: "text/markdown",
							contentMetadata: { title: "New Article" },
						},
						{
							id: 3,
							jrn: "article:deselected",
							updatedAt: new Date("2024-01-14T10:00:00Z"), // Still exists, just deselected
							contentType: "text/markdown",
							contentMetadata: { title: "Deselected Article" },
						},
						// article:db-deleted not returned (deleted from DB)
					];
					vi.mocked(mockDocs.findAll).mockResolvedValue(
						docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
					);

					const result = await siteDao.getChangedArticles(1);

					// Verify all change types
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:updated", changeType: "updated" }),
					);
					expect(result).toContainEqual(expect.objectContaining({ jrn: "article:new", changeType: "new" }));
					// DB-deleted should appear as deleted
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:db-deleted", changeType: "deleted" }),
					);
					// Deselected article SHOULD also appear as deleted (needs removal from site)
					expect(result).toContainEqual(
						expect.objectContaining({ jrn: "article:deselected", changeType: "deleted" }),
					);
					expect(result).toHaveLength(4); // updated, new, db-deleted, deselected
				});
			});
		});

		describe("Navigation Change Detection (_meta.js sync)", () => {
			it("should flag navigation change when article is added (new changeType)", async () => {
				const docsite = createTestSite({
					generatedArticleJrns: ["article:existing"],
					selectedArticleJrns: ["article:existing", "article:new"],
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

				const docs = [
					{
						id: 1,
						jrn: "article:existing",
						updatedAt: new Date("2024-01-14T10:00:00Z"),
						contentType: "text/markdown",
						contentMetadata: { title: "Existing" },
					},
					{
						id: 2,
						jrn: "article:new",
						updatedAt: new Date("2024-01-14T10:00:00Z"),
						contentType: "text/markdown",
						contentMetadata: { title: "New Article" },
					},
				];
				vi.mocked(mockDocs.findAll).mockResolvedValue(
					docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
				);

				const result = await siteDao.getChangedArticles(1);

				// Navigation should change because there's a "new" article
				const hasNewOrDeleted = result.some(r => r.changeType === "new" || r.changeType === "deleted");
				expect(hasNewOrDeleted).toBe(true);
			});

			it("should flag navigation change when article is deleted from DB", async () => {
				// Test actual DB deletion, not deselection
				const docsite = createTestSite({
					generatedArticleJrns: ["article:existing", "article:deleted-from-db"],
					selectedArticleJrns: ["article:existing", "article:deleted-from-db"],
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

				// Only article:existing in DB - article:deleted-from-db was deleted
				const docs = [
					{
						id: 1,
						jrn: "article:existing",
						updatedAt: new Date("2024-01-14T10:00:00Z"),
						contentType: "text/markdown",
						contentMetadata: { title: "Existing" },
					},
				];
				vi.mocked(mockDocs.findAll).mockResolvedValue(
					docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
				);

				const result = await siteDao.getChangedArticles(1);

				// Navigation should change because there's a "deleted" article
				const hasNewOrDeleted = result.some(r => r.changeType === "new" || r.changeType === "deleted");
				expect(hasNewOrDeleted).toBe(true);
			});

			it("should NOT flag navigation change when only content is updated", async () => {
				const docsite = createTestSite({
					generatedArticleJrns: ["article:a"],
					selectedArticleJrns: ["article:a"],
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);

				const docs = [
					{
						id: 1,
						jrn: "article:a",
						updatedAt: new Date("2024-01-16T10:00:00Z"), // Updated
						contentType: "text/markdown",
						contentMetadata: { title: "Article A" },
					},
				];
				vi.mocked(mockDocs.findAll).mockResolvedValue(
					docs.map(d => ({ get: vi.fn().mockReturnValue(d) })) as never,
				);

				const result = await siteDao.getChangedArticles(1);

				// Only has updated, no new or deleted
				expect(result).toHaveLength(1);
				expect(result[0].changeType).toBe("updated");
				const hasNewOrDeleted = result.some(r => r.changeType === "new" || r.changeType === "deleted");
				expect(hasNewOrDeleted).toBe(false);
			});
		});

		describe("Edge Cases", () => {
			it("should handle empty selection (all articles deselected)", async () => {
				// Empty array [] means "zero articles selected", NOT "include all"
				// This allows users to create placeholder sites with no content
				const docsite = createTestSite({
					generatedArticleJrns: ["article:a", "article:b"],
					selectedArticleJrns: [], // Zero articles selected - all will be removed
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
				// Articles exist in DB but none are selected
				vi.mocked(mockDocs.findAll).mockResolvedValue([
					{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
					{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") },
				] as never);

				const result = await siteDao.checkIfNeedsUpdate(1);
				// Change needed - previously generated articles need to be removed
				expect(result).toBe(true);
			});

			it("should handle selection with non-existent article JRNs", async () => {
				// User selected articles that don't exist (could happen if article was deleted)
				const docsite = createTestSite({
					generatedArticleJrns: ["article:exists"],
					selectedArticleJrns: ["article:exists", "article:ghost"], // ghost doesn't exist
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
				// Only article:exists is returned from DB
				vi.mocked(mockDocs.findAll).mockResolvedValue([
					{ jrn: "article:exists", updatedAt: new Date("2024-01-14T10:00:00Z") },
				] as never);

				const result = await siteDao.checkIfNeedsUpdate(1);
				// No change because article:ghost was never generated
				expect(result).toBe(false);
			});

			it("should handle first generation (no generatedArticleJrns)", async () => {
				const docsite = createTestSite({
					generatedArticleJrns: [], // First generation
					selectedArticleJrns: ["article:a", "article:b"],
				});

				const mockInstance = { get: vi.fn().mockReturnValue(docsite) };
				vi.mocked(mockNewDocsites.findByPk).mockResolvedValue(mockInstance as never);
				vi.mocked(mockDocs.findAll).mockResolvedValue([
					{ jrn: "article:a", updatedAt: new Date("2024-01-14T10:00:00Z") },
					{ jrn: "article:b", updatedAt: new Date("2024-01-14T10:00:00Z") },
				] as never);

				const result = await siteDao.checkIfNeedsUpdate(1);
				// All articles are "new" since nothing was generated before
				expect(result).toBe(true);
			});
		});
	});

	describe("getSiteBySubdomain", () => {
		it("should return site when subdomain exists", async () => {
			const site: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					subdomain: "docs",
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(site),
			};

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([mockInstance] as never);

			const result = await siteDao.getSiteBySubdomain("docs");

			expect(mockSequelize.where).toHaveBeenCalled();
			expect(mockSequelize.fn).toHaveBeenCalledWith("lower", "metadata->>'subdomain'");
			expect(mockSequelize.literal).toHaveBeenCalledWith("metadata->>'subdomain'");
			expect(mockNewDocsites.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 1,
				}),
			);
			expect(result).toEqual(site);
		});

		it("should return undefined when subdomain does not exist", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const result = await siteDao.getSiteBySubdomain("nonexistent");

			expect(result).toBeUndefined();
		});

		it("should be case-insensitive", async () => {
			const site: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					subdomain: "docs",
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(site),
			};

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([mockInstance] as never);

			const result = await siteDao.getSiteBySubdomain("DOCS");

			// Verify the subdomain was lowercased in the query
			expect(mockSequelize.where).toHaveBeenCalledWith(
				expect.anything(),
				"docs", // Should be lowercased
			);
			expect(result).toEqual(site);
		});
	});

	describe("getSiteByCustomDomain", () => {
		it("should return site when custom domain exists", async () => {
			const site: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					customDomains: [
						{
							domain: "docs.example.com",
							status: "verified",
							addedAt: "2024-01-15T10:00:00Z",
						},
					],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(site),
			};

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([mockInstance] as never);

			const result = await siteDao.getSiteByCustomDomain("docs.example.com");

			expect(mockSequelize.literal).toHaveBeenCalled();
			expect(mockNewDocsites.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					limit: 1,
					replacements: { domain: "docs.example.com" },
				}),
			);
			expect(result).toEqual(site);
		});

		it("should return undefined when custom domain does not exist", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const result = await siteDao.getSiteByCustomDomain("nonexistent.com");

			expect(result).toBeUndefined();
		});

		it("should be case-insensitive", async () => {
			const site: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					customDomains: [
						{
							domain: "docs.example.com",
							status: "verified",
							addedAt: "2024-01-15T10:00:00Z",
						},
					],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(site),
			};

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([mockInstance] as never);

			const result = await siteDao.getSiteByCustomDomain("DOCS.EXAMPLE.COM");

			// Verify query was made with uppercase domain (case-insensitivity handled by SQL LOWER())
			expect(mockNewDocsites.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					replacements: { domain: "DOCS.EXAMPLE.COM" },
				}),
			);
			expect(result).toEqual(site);
		});

		it("should find site with multiple custom domains", async () => {
			const site: Site = {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					customDomains: [
						{
							domain: "docs.example.com",
							status: "verified",
							addedAt: "2024-01-15T10:00:00Z",
						},
						{
							domain: "help.example.com",
							status: "verified",
							addedAt: "2024-01-15T10:00:00Z",
						},
					],
				},
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T10:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(site),
			};

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([mockInstance] as never);

			const result = await siteDao.getSiteByCustomDomain("help.example.com");

			expect(result).toEqual(site);
		});

		it("should handle sites with null or missing customDomains field", async () => {
			// Test that the query doesn't throw an error when customDomains is missing
			// The COALESCE in the query treats missing customDomains as an empty array
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([]);

			const result = await siteDao.getSiteByCustomDomain("any-domain.com");

			// Should return undefined (domain not found) without throwing error
			expect(result).toBeUndefined();
			expect(mockNewDocsites.findAll).toHaveBeenCalled();
		});
	});

	describe("getSitesForArticle", () => {
		/** Helper to build a mock Sequelize model instance wrapping a Site plain object */
		function makeMockInstance(plain: Site): { get: ReturnType<typeof vi.fn> } {
			return { get: vi.fn().mockReturnValue(plain) };
		}

		function makeSite(overrides: Partial<Site> = {}): Site {
			return {
				id: 1,
				name: "test-site",
				displayName: "Test Site",
				userId: 1,
				status: "active",
				visibility: "external",
				metadata: undefined,
				lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
				createdAt: new Date("2024-01-15T08:00:00Z"),
				updatedAt: new Date("2024-01-15T10:00:00Z"),
				...overrides,
			};
		}

		it("should return all sites in include-all mode when selectedArticleJrns is undefined", async () => {
			// Sites with no selectedArticleJrns are in include-all mode and match every article
			const site1 = makeSite({ id: 1, name: "site-one", displayName: "Site One", metadata: undefined });
			const site2 = makeSite({ id: 2, name: "site-two", displayName: "Site Two", metadata: undefined });

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([
				makeMockInstance(site1),
				makeMockInstance(site2),
			] as never);

			const result = await siteDao.getSitesForArticle("/docs/intro");

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ id: 1, name: "site-one", displayName: "Site One", visibility: "external" });
			expect(result[1]).toEqual({ id: 2, name: "site-two", displayName: "Site Two", visibility: "external" });
		});

		it("should return all sites in include-all mode when metadata has no selectedArticleJrns field", async () => {
			// Metadata present but selectedArticleJrns omitted is also include-all mode
			const site = makeSite({
				id: 1,
				name: "include-all-site",
				displayName: "Include All Site",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					// selectedArticleJrns intentionally absent
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([makeMockInstance(site)] as never);

			const result = await siteDao.getSitesForArticle("/docs/guide");

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("include-all-site");
		});

		it("should return only sites that explicitly include the article JRN", async () => {
			const targetJrn = "/docs/target-article";
			const matchingSite = makeSite({
				id: 1,
				name: "matching-site",
				displayName: "Matching Site",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					selectedArticleJrns: [targetJrn, "/docs/other-article"],
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([makeMockInstance(matchingSite)] as never);

			const result = await siteDao.getSitesForArticle(targetJrn);

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("matching-site");
		});

		it("should return empty array when no sites match the article JRN", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([] as never);

			const result = await siteDao.getSitesForArticle("/docs/unrelated-article");

			expect(result).toHaveLength(0);
		});

		it("should map visibility to 'internal' when jwtAuth.enabled is true", async () => {
			const site = makeSite({
				id: 1,
				name: "jwt-protected-site",
				displayName: "JWT Protected Site",
				visibility: "internal",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 3,
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: "test-public-key",
					},
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([makeMockInstance(site)] as never);

			const result = await siteDao.getSitesForArticle("/docs/any-article");

			expect(result).toHaveLength(1);
			expect(result[0].visibility).toBe("internal");
		});

		it("should map visibility to 'external' when jwtAuth is absent", async () => {
			const site = makeSite({
				id: 1,
				name: "public-site",
				displayName: "Public Site",
				visibility: "external",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 3,
					// No jwtAuth field at all
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([makeMockInstance(site)] as never);

			const result = await siteDao.getSitesForArticle("/docs/any-article");

			expect(result).toHaveLength(1);
			expect(result[0].visibility).toBe("external");
		});

		it("should map visibility to 'external' when jwtAuth.enabled is false", async () => {
			const site = makeSite({
				id: 1,
				name: "disabled-auth-site",
				displayName: "Disabled Auth Site",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 2,
					jwtAuth: {
						enabled: false,
						mode: "full",
						loginUrl: "/login",
						publicKey: "test-public-key",
					},
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([makeMockInstance(site)] as never);

			const result = await siteDao.getSitesForArticle("/docs/any-article");

			expect(result).toHaveLength(1);
			expect(result[0].visibility).toBe("external");
		});

		it("should handle mixed include-all and explicit-selection sites", async () => {
			const targetJrn = "/docs/shared-article";

			// Site 1: include-all (matches because selectedArticleJrns IS NULL)
			const includeAllSite = makeSite({
				id: 1,
				name: "include-all-site",
				displayName: "Include All Site",
				metadata: undefined,
			});

			// Site 2: explicitly selects the target JRN with JWT auth enabled
			const explicitMatchSite = makeSite({
				id: 2,
				name: "explicit-match-site",
				displayName: "Explicit Match Site",
				metadata: {
					githubRepo: "org/repo",
					githubUrl: "https://github.com/org/repo",
					framework: "nextra",
					articleCount: 5,
					selectedArticleJrns: [targetJrn, "/docs/other"],
					jwtAuth: {
						enabled: true,
						mode: "full",
						loginUrl: "/login",
						publicKey: "test-key",
					},
				},
			});

			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([
				makeMockInstance(includeAllSite),
				makeMockInstance(explicitMatchSite),
			] as never);

			const result = await siteDao.getSitesForArticle(targetJrn);

			expect(result).toHaveLength(2);
			expect(result.map(s => s.name)).toContain("include-all-site");
			expect(result.map(s => s.name)).toContain("explicit-match-site");

			// Verify visibility is derived from jwtAuth, not the site's stored visibility field
			const includeAllResult = result.find(s => s.name === "include-all-site");
			expect(includeAllResult?.visibility).toBe("external");

			const explicitResult = result.find(s => s.name === "explicit-match-site");
			expect(explicitResult?.visibility).toBe("internal");
		});

		it("should call findAll with required attributes and the JRN replacement for the WHERE clause", async () => {
			vi.mocked(mockNewDocsites.findAll).mockResolvedValue([] as never);

			await siteDao.getSitesForArticle("/docs/any-article");

			expect(mockNewDocsites.findAll).toHaveBeenCalledWith(
				expect.objectContaining({
					attributes: ["id", "name", "displayName", "metadata"],
					// Verify the JRN is passed as a parameterised replacement (not interpolated directly)
					replacements: expect.objectContaining({
						jrnJson: JSON.stringify(["/docs/any-article"]),
					}),
				}),
			);
		});
	});
});

describe("createSiteDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as SiteDao;
		const provider = createSiteDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context siteDao when context has database", () => {
		const defaultDao = {} as SiteDao;
		const contextSiteDao = {} as SiteDao;
		const context = {
			database: {
				siteDao: contextSiteDao,
			},
		} as TenantOrgContext;

		const provider = createSiteDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextSiteDao);
	});
});
