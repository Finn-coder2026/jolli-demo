import type { Database } from "../core/Database";
import type { Docsite, Site } from "../model/Docsite";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createDocsiteDao, createDocsiteDaoProvider, type DocsiteDao } from "./DocsiteDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DocsiteDao", () => {
	let mockDocsites: ModelDef<Docsite>;
	let docsiteDao: DocsiteDao;

	beforeEach(() => {
		mockDocsites = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Docsite>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockDocsites),
		} as unknown as Sequelize;

		docsiteDao = createDocsiteDao(mockSequelize);
	});

	describe("createDocsite", () => {
		it("should create a docsite with minimal data", async () => {
			const newDocsite: Site = {
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 1,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
			};

			const createdDocsite: Docsite = {
				...newDocsite,
				id: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(createdDocsite),
			};

			vi.mocked(mockDocsites.create).mockResolvedValue(mockInstance as never);

			const result = await docsiteDao.createDocsite(newDocsite);

			expect(mockDocsites.create).toHaveBeenCalledWith(newDocsite);
			expect(mockInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdDocsite);
		});

		it("should create a docsite with full metadata", async () => {
			const newDocsite: Site = {
				name: "full-docs",
				displayName: "Full Documentation",
				userId: 2,
				visibility: "external",
				status: "active",
				metadata: {
					repos: [
						{
							repo: "owner/repo",
							branch: "main",
							paths: ["/docs"],
							integrationId: 123,
						},
					],
					deployments: [
						{
							environment: "production",
							url: "https://docs.example.com",
							deploymentId: "dpl_123",
							deployedAt: "2024-01-01T00:00:00Z",
							status: "ready",
						},
					],
					framework: "docusaurus",
					buildCommand: "npm run build",
					outputDirectory: "build",
					lastBuildAt: "2024-01-01T00:00:00Z",
					lastDeployedAt: "2024-01-01T00:00:00Z",
				},
			};

			const createdDocsite: Docsite = {
				...newDocsite,
				id: 2,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(createdDocsite),
			};

			vi.mocked(mockDocsites.create).mockResolvedValue(mockInstance as never);

			const result = await docsiteDao.createDocsite(newDocsite);

			expect(result).toEqual(createdDocsite);
			expect(result.metadata?.repos).toHaveLength(1);
			expect(result.metadata?.deployments).toHaveLength(1);
		});

		it("should create a docsite without userId", async () => {
			const newDocsite: Site = {
				name: "orphan-docs",
				displayName: "Orphan Documentation",
				userId: undefined,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
			};

			const createdDocsite: Docsite = {
				...newDocsite,
				id: 3,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(createdDocsite),
			};

			vi.mocked(mockDocsites.create).mockResolvedValue(mockInstance as never);

			const result = await docsiteDao.createDocsite(newDocsite);

			expect(result.userId).toBeUndefined();
		});
	});

	describe("getDocsite", () => {
		it("should get a docsite by id", async () => {
			const docsite: Docsite = {
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 1,
				visibility: "internal",
				status: "active",
				metadata: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockDocsites.findByPk).mockResolvedValue(mockInstance as never);

			const result = await docsiteDao.getDocsite(1);

			expect(mockDocsites.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(docsite);
		});

		it("should return undefined if docsite not found", async () => {
			vi.mocked(mockDocsites.findByPk).mockResolvedValue(null);

			const result = await docsiteDao.getDocsite(999);

			expect(result).toBeUndefined();
		});
	});

	describe("getDocsiteByName", () => {
		it("should get a docsite by name", async () => {
			const docsite: Docsite = {
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 1,
				visibility: "internal",
				status: "active",
				metadata: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(docsite),
			};

			vi.mocked(mockDocsites.findOne).mockResolvedValue(mockInstance as never);

			const result = await docsiteDao.getDocsiteByName("test-docs");

			expect(mockDocsites.findOne).toHaveBeenCalledWith({ where: { name: "test-docs" } });
			expect(result).toEqual(docsite);
		});

		it("should return undefined if docsite not found by name", async () => {
			vi.mocked(mockDocsites.findOne).mockResolvedValue(null);

			const result = await docsiteDao.getDocsiteByName("non-existent");

			expect(result).toBeUndefined();
		});
	});

	describe("listDocsites", () => {
		it("should list all docsites", async () => {
			const docsites: Array<Docsite> = [
				{
					id: 1,
					name: "docs-1",
					displayName: "Docs 1",
					userId: 1,
					visibility: "internal",
					status: "active",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					name: "docs-2",
					displayName: "Docs 2",
					userId: 2,
					visibility: "external",
					status: "pending",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await docsiteDao.listDocsites();

			expect(mockDocsites.findAll).toHaveBeenCalledWith({ order: [["createdAt", "DESC"]] });
			expect(result).toHaveLength(2);
			expect(result).toEqual(docsites);
		});

		it("should return empty array if no docsites", async () => {
			vi.mocked(mockDocsites.findAll).mockResolvedValue([]);

			const result = await docsiteDao.listDocsites();

			expect(result).toEqual([]);
		});
	});

	describe("listDocsitesByUser", () => {
		it("should list docsites by user id", async () => {
			const docsites: Array<Docsite> = [
				{
					id: 1,
					name: "user-docs-1",
					displayName: "User Docs 1",
					userId: 1,
					visibility: "internal",
					status: "active",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await docsiteDao.listDocsitesByUser(1);

			expect(mockDocsites.findAll).toHaveBeenCalledWith({
				where: { userId: 1 },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});
	});

	describe("listDocsitesByVisibility", () => {
		it("should list internal docsites", async () => {
			const docsites: Array<Docsite> = [
				{
					id: 1,
					name: "internal-docs",
					displayName: "Internal Docs",
					userId: 1,
					visibility: "internal",
					status: "active",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await docsiteDao.listDocsitesByVisibility("internal");

			expect(mockDocsites.findAll).toHaveBeenCalledWith({
				where: { visibility: "internal" },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});

		it("should list external docsites", async () => {
			const docsites: Array<Docsite> = [
				{
					id: 2,
					name: "public-docs",
					displayName: "Public Docs",
					userId: 2,
					visibility: "external",
					status: "active",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await docsiteDao.listDocsitesByVisibility("external");

			expect(mockDocsites.findAll).toHaveBeenCalledWith({
				where: { visibility: "external" },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});
	});

	describe("listDocsitesByStatus", () => {
		it("should list docsites by status", async () => {
			const docsites: Array<Docsite> = [
				{
					id: 1,
					name: "active-docs",
					displayName: "Active Docs",
					userId: 1,
					visibility: "internal",
					status: "active",
					metadata: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockInstances = docsites.map(d => ({
				get: vi.fn().mockReturnValue(d),
			}));

			vi.mocked(mockDocsites.findAll).mockResolvedValue(mockInstances as never);

			const result = await docsiteDao.listDocsitesByStatus("active");

			expect(mockDocsites.findAll).toHaveBeenCalledWith({
				where: { status: "active" },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(docsites);
		});
	});

	describe("updateDocsite", () => {
		it("should update an existing docsite", async () => {
			const existingDocsite: Docsite = {
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 1,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const updatedDocsite: Docsite = {
				...existingDocsite,
				status: "active",
			};

			const mockExistingInstance = {
				get: vi.fn().mockReturnValue(existingDocsite),
			};

			const mockUpdatedInstance = {
				get: vi.fn().mockReturnValue(updatedDocsite),
			};

			vi.mocked(mockDocsites.findByPk).mockResolvedValueOnce(mockExistingInstance as never);
			vi.mocked(mockDocsites.update).mockResolvedValue([1] as never);
			vi.mocked(mockDocsites.findByPk).mockResolvedValueOnce(mockUpdatedInstance as never);

			const result = await docsiteDao.updateDocsite(updatedDocsite);

			expect(mockDocsites.update).toHaveBeenCalledWith(updatedDocsite, { where: { id: 1 } });
			expect(result).toEqual(updatedDocsite);
		});

		it("should return undefined if docsite does not exist", async () => {
			const docsite: Docsite = {
				id: 999,
				name: "non-existent",
				displayName: "Non Existent",
				userId: 1,
				visibility: "internal",
				status: "pending",
				metadata: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			vi.mocked(mockDocsites.findByPk).mockResolvedValue(null);

			const result = await docsiteDao.updateDocsite(docsite);

			expect(mockDocsites.update).not.toHaveBeenCalled();
			expect(result).toBeUndefined();
		});
	});

	describe("deleteDocsite", () => {
		it("should delete a docsite", async () => {
			vi.mocked(mockDocsites.destroy).mockResolvedValue(1);

			await docsiteDao.deleteDocsite(1);

			expect(mockDocsites.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
		});
	});

	describe("deleteAllDocsites", () => {
		it("should delete all docsites", async () => {
			vi.mocked(mockDocsites.destroy).mockResolvedValue(3);

			await docsiteDao.deleteAllDocsites();

			expect(mockDocsites.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("createDocsiteDaoProvider", () => {
		it("returns default DAO when context is undefined", () => {
			const defaultDao = {} as DocsiteDao;
			const provider = createDocsiteDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns tenant DAO when context has database with docsiteDao", () => {
			const defaultDao = {} as DocsiteDao;
			const tenantDao = {} as DocsiteDao;
			const context = {
				database: { docsiteDao: tenantDao } as Database,
			} as TenantOrgContext;
			const provider = createDocsiteDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(tenantDao);
		});

		it("returns default DAO when context database has no docsiteDao", () => {
			const defaultDao = {} as DocsiteDao;
			const context = {
				database: {} as Database,
			} as TenantOrgContext;
			const provider = createDocsiteDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
