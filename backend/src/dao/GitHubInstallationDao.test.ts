import type { Database } from "../core/Database";
import type { GitHubInstallation } from "../model/GitHubInstallation";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import {
	createGitHubInstallationDao,
	createGitHubInstallationDaoProvider,
	type GitHubInstallationDao,
} from "./GitHubInstallationDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

function mockGitHubInstallation(overrides?: Partial<GitHubInstallation>): GitHubInstallation {
	return {
		id: 1,
		containerType: "org",
		name: "test-installation",
		installationId: 789012,
		repos: [],
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

describe("GitHubInstallationDao", () => {
	let mockGitHubInstallations: ModelDef<GitHubInstallation>;
	let dao: GitHubInstallationDao;

	beforeEach(() => {
		mockGitHubInstallations = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<GitHubInstallation>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockGitHubInstallations),
		} as unknown as Sequelize;

		dao = createGitHubInstallationDao(mockSequelize);
	});

	describe("createInstallation", () => {
		it("should create a new GitHub Installation for org", async () => {
			const installation = mockGitHubInstallation({ name: "new-org", containerType: "org" });
			const mockInstance = {
				get: vi.fn().mockReturnValue(installation),
			};
			vi.mocked(mockGitHubInstallations.create).mockResolvedValue(mockInstance as never);

			const result = await dao.createInstallation({
				containerType: "org",
				name: "new-org",
				installationId: 789012,
				repos: [],
			});

			expect(result).toEqual(installation);
			expect(mockGitHubInstallations.create).toHaveBeenCalled();
		});

		it("should create a new GitHub Installation for user", async () => {
			const installation = mockGitHubInstallation({ name: "new-user", containerType: "user" });
			const mockInstance = {
				get: vi.fn().mockReturnValue(installation),
			};
			vi.mocked(mockGitHubInstallations.create).mockResolvedValue(mockInstance as never);

			const result = await dao.createInstallation({
				containerType: "user",
				name: "new-user",
				installationId: 789012,
				repos: [],
			});

			expect(result).toEqual(installation);
			expect(mockGitHubInstallations.create).toHaveBeenCalled();
		});
	});

	describe("lookupByName", () => {
		it("should find installation by name", async () => {
			const installation = mockGitHubInstallation({ name: "test-installation" });
			const mockInstance = {
				get: vi.fn().mockReturnValue(installation),
			};
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(mockInstance as never);

			const result = await dao.lookupByName("test-installation");

			expect(result).toEqual(installation);
			expect(mockGitHubInstallations.findOne).toHaveBeenCalledWith({
				where: {
					name: "test-installation",
				},
			});
		});

		it("should return undefined when installation not found", async () => {
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(null);

			const result = await dao.lookupByName("nonexistent");

			expect(result).toBeUndefined();
		});
	});

	describe("lookupByInstallationId", () => {
		it("should find installation by installation ID", async () => {
			const installation = mockGitHubInstallation({ installationId: 123456 });
			const mockInstance = {
				get: vi.fn().mockReturnValue(installation),
			};
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(mockInstance as never);

			const result = await dao.lookupByInstallationId(123456);

			expect(result).toEqual(installation);
			expect(mockGitHubInstallations.findOne).toHaveBeenCalledWith({
				where: {
					installationId: 123456,
				},
			});
		});

		it("should return undefined when installation not found", async () => {
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(null);

			const result = await dao.lookupByInstallationId(999999);

			expect(result).toBeUndefined();
		});
	});

	describe("listInstallations", () => {
		it("should list all installations ordered by id descending", async () => {
			const installations = [
				mockGitHubInstallation({ id: 2, name: "installation2", containerType: "org" }),
				mockGitHubInstallation({ id: 1, name: "installation1", containerType: "user" }),
			];
			const mockInstances = installations.map(installation => ({
				get: vi.fn().mockReturnValue(installation),
			}));
			vi.mocked(mockGitHubInstallations.findAll).mockResolvedValue(mockInstances as never);

			const result = await dao.listInstallations();

			expect(result).toEqual(installations);
			expect(mockGitHubInstallations.findAll).toHaveBeenCalledWith({
				where: {},
				order: [["id", "DESC"]],
			});
		});

		it("should list only org installations when containerType=org", async () => {
			const orgInstallations = [
				mockGitHubInstallation({ id: 2, name: "org2", containerType: "org" }),
				mockGitHubInstallation({ id: 1, name: "org1", containerType: "org" }),
			];
			const mockInstances = orgInstallations.map(installation => ({
				get: vi.fn().mockReturnValue(installation),
			}));
			vi.mocked(mockGitHubInstallations.findAll).mockResolvedValue(mockInstances as never);

			const result = await dao.listInstallations("org");

			expect(result).toEqual(orgInstallations);
			expect(mockGitHubInstallations.findAll).toHaveBeenCalledWith({
				where: { containerType: "org" },
				order: [["id", "DESC"]],
			});
		});

		it("should list only user installations when containerType=user", async () => {
			const userInstallations = [mockGitHubInstallation({ id: 1, name: "user1", containerType: "user" })];
			const mockInstances = userInstallations.map(installation => ({
				get: vi.fn().mockReturnValue(installation),
			}));
			vi.mocked(mockGitHubInstallations.findAll).mockResolvedValue(mockInstances as never);

			const result = await dao.listInstallations("user");

			expect(result).toEqual(userInstallations);
			expect(mockGitHubInstallations.findAll).toHaveBeenCalledWith({
				where: { containerType: "user" },
				order: [["id", "DESC"]],
			});
		});

		it("should return empty array when no installations exist", async () => {
			vi.mocked(mockGitHubInstallations.findAll).mockResolvedValue([]);

			const result = await dao.listInstallations();

			expect(result).toEqual([]);
		});
	});

	describe("updateInstallation", () => {
		it("should update an existing installation", async () => {
			const installation = mockGitHubInstallation({
				id: 42,
				name: "updated-installation",
				repos: ["repo1", "repo2"],
			});
			const mockInstance = {
				get: vi.fn().mockReturnValue(installation),
			};
			vi.mocked(mockGitHubInstallations.update).mockResolvedValue([1] as never);
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(mockInstance as never);

			const result = await dao.updateInstallation(installation);

			expect(result).toEqual(installation);
			expect(mockGitHubInstallations.update).toHaveBeenCalledWith(installation, {
				where: { id: 42 },
			});
		});

		it("should throw error when installation not found after update", async () => {
			const installation = mockGitHubInstallation({ id: 42 });
			vi.mocked(mockGitHubInstallations.update).mockResolvedValue([1] as never);
			vi.mocked(mockGitHubInstallations.findOne).mockResolvedValue(null);

			await expect(dao.updateInstallation(installation)).rejects.toThrow(
				"GitHub Installation with id 42 not found after update",
			);
		});
	});

	describe("deleteInstallation", () => {
		it("should delete an installation by id", async () => {
			vi.mocked(mockGitHubInstallations.destroy).mockResolvedValue(1);

			await dao.deleteInstallation(42);

			expect(mockGitHubInstallations.destroy).toHaveBeenCalledWith({
				where: { id: 42 },
			});
		});
	});

	describe("deleteAllInstallations", () => {
		it("should delete all installations", async () => {
			vi.mocked(mockGitHubInstallations.destroy).mockResolvedValue(5);

			await dao.deleteAllInstallations();

			expect(mockGitHubInstallations.destroy).toHaveBeenCalledWith({ where: {} });
		});
	});

	describe("createGitHubInstallationDaoProvider", () => {
		it("returns default DAO when context is undefined", () => {
			const defaultDao = {} as GitHubInstallationDao;
			const provider = createGitHubInstallationDaoProvider(defaultDao);

			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("returns tenant DAO when context has database with githubInstallationDao", () => {
			const defaultDao = {} as GitHubInstallationDao;
			const tenantDao = {} as GitHubInstallationDao;
			const context = {
				database: { githubInstallationDao: tenantDao } as unknown as Database,
			} as TenantOrgContext;
			const provider = createGitHubInstallationDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(tenantDao);
		});

		it("returns default DAO when context database has no githubInstallationDao", () => {
			const defaultDao = {} as GitHubInstallationDao;
			const context = {
				database: {} as Database,
			} as TenantOrgContext;
			const provider = createGitHubInstallationDaoProvider(defaultDao);

			const result = provider.getDao(context);

			expect(result).toBe(defaultDao);
		});
	});
});
