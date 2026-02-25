import type { UserOrg } from "../model/UserOrg";
import type { ModelDef } from "../util/ModelDef";
import { createUserOrgDao, type UserOrgDao } from "./UserOrgDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("UserOrgDao", () => {
	let mockUserOrgs: ModelDef<UserOrg>;
	let mockSequelize: Sequelize;
	let userOrgDao: UserOrgDao;

	beforeEach(() => {
		mockUserOrgs = {
			create: vi.fn(),
			update: vi.fn(),
			findAll: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<UserOrg>;

		mockSequelize = {
			models: {
				UserOrg: mockUserOrgs,
			},
			query: vi.fn(),
		} as unknown as Sequelize;

		userOrgDao = createUserOrgDao(mockSequelize);
	});

	describe("getUserTenants", () => {
		it("should return user tenants with joined data", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					orgId: "org1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date("2025-01-20"),
				},
				{
					tenantId: "tenant2",
					orgId: "org2",
					tenantSlug: "widgets",
					tenantName: "Widgets Inc",
					orgSlug: "default",
					orgName: "Default Org",
					role: "member",
					isDefault: false,
					lastAccessedAt: undefined,
				},
			];

			vi.mocked(mockSequelize.query).mockResolvedValue(mockTenants as never);

			const result = await userOrgDao.getUserTenants(1);

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("SELECT"),
				expect.objectContaining({
					replacements: { userId: 1 },
				}),
			);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				tenantId: "tenant1",
				orgId: "org1",
				tenantSlug: "acme",
				tenantName: "Acme Corp",
				orgSlug: "main",
				orgName: "Main Org",
				role: "admin",
				isDefault: true,
				lastAccessedAt: new Date("2025-01-20"),
			});
			expect(result[1]).toEqual({
				tenantId: "tenant2",
				orgId: "org2",
				tenantSlug: "widgets",
				tenantName: "Widgets Inc",
				orgSlug: "default",
				orgName: "Default Org",
				role: "member",
				isDefault: false,
				lastAccessedAt: undefined,
			});
		});

		it("should return empty array when user has no tenants", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([] as never);

			const result = await userOrgDao.getUserTenants(1);

			expect(result).toEqual([]);
		});
	});

	describe("createUserOrg", () => {
		it("should create user-org relationship", async () => {
			const newUserOrg: UserOrg = {
				id: 1,
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
				isDefault: false,
				lastAccessedAt: undefined,
				createdAt: new Date(),
			};

			const mockUserOrgInstance = {
				get: vi.fn().mockReturnValue(newUserOrg),
			};

			vi.mocked(mockUserOrgs.create).mockResolvedValue(mockUserOrgInstance as never);

			const result = await userOrgDao.createUserOrg({
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(mockUserOrgs.create).toHaveBeenCalledWith(
				{
					userId: 1,
					tenantId: "tenant1",
					orgId: "org1",
					role: "member",
					isDefault: false,
				},
				{ transaction: null },
			);
			expect(result).toEqual(newUserOrg);
		});

		it("should create default user-org relationship", async () => {
			const newUserOrg: UserOrg = {
				id: 1,
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				role: "admin",
				isDefault: true,
				lastAccessedAt: undefined,
				createdAt: new Date(),
			};

			const mockUserOrgInstance = {
				get: vi.fn().mockReturnValue(newUserOrg),
			};

			vi.mocked(mockUserOrgs.create).mockResolvedValue(mockUserOrgInstance as never);

			const result = await userOrgDao.createUserOrg({
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				role: "admin",
				isDefault: true,
			});

			expect(mockUserOrgs.create).toHaveBeenCalledWith(
				{
					userId: 1,
					tenantId: "tenant1",
					orgId: "org1",
					role: "admin",
					isDefault: true,
				},
				{ transaction: null },
			);
			expect(result).toEqual(newUserOrg);
		});

		it("should set role to null when not provided", async () => {
			const newUserOrg: UserOrg = {
				id: 1,
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				role: null,
				isDefault: true,
				lastAccessedAt: undefined,
				createdAt: new Date(),
			};

			const mockUserOrgInstance = {
				get: vi.fn().mockReturnValue(newUserOrg),
			};

			vi.mocked(mockUserOrgs.create).mockResolvedValue(mockUserOrgInstance as never);

			const result = await userOrgDao.createUserOrg({
				userId: 1,
				tenantId: "tenant1",
				orgId: "org1",
				isDefault: true,
			});

			expect(mockUserOrgs.create).toHaveBeenCalledWith(
				{
					userId: 1,
					tenantId: "tenant1",
					orgId: "org1",
					role: "member",
					isDefault: true,
				},
				{ transaction: null },
			);
			expect(result).toEqual(newUserOrg);
		});
	});

	describe("updateLastAccessed", () => {
		it("should update last accessed timestamp", async () => {
			vi.mocked(mockUserOrgs.update).mockResolvedValue([1] as never);

			await userOrgDao.updateLastAccessed(1, "tenant1", "org1");

			expect(mockUserOrgs.update).toHaveBeenCalledWith(
				{ lastAccessedAt: expect.any(Date) },
				{
					where: {
						userId: 1,
						tenantId: "tenant1",
						orgId: "org1",
					},
				},
			);
		});
	});

	describe("setDefaultTenant", () => {
		it("should set tenant as default", async () => {
			vi.mocked(mockUserOrgs.update).mockResolvedValue([1] as never);

			await userOrgDao.setDefaultTenant(1, "tenant1", "org1");

			// Should clear all defaults first
			expect(mockUserOrgs.update).toHaveBeenCalledWith({ isDefault: false }, { where: { userId: 1 } });

			// Then set the new default
			expect(mockUserOrgs.update).toHaveBeenCalledWith(
				{ isDefault: true },
				{
					where: {
						userId: 1,
						tenantId: "tenant1",
						orgId: "org1",
					},
				},
			);
		});
	});

	describe("updateRole", () => {
		it("should update user role in org", async () => {
			vi.mocked(mockUserOrgs.update).mockResolvedValue([1] as never);

			await userOrgDao.updateRole(1, "tenant1", "org1", "member");

			expect(mockUserOrgs.update).toHaveBeenCalledWith(
				{ role: "member" },
				{
					where: { userId: 1, tenantId: "tenant1", orgId: "org1" },
					transaction: null,
				},
			);
		});

		it("should update role with transaction", async () => {
			const mockTransaction = {} as never;
			vi.mocked(mockUserOrgs.update).mockResolvedValue([1] as never);

			await userOrgDao.updateRole(1, "tenant1", "org1", "owner", mockTransaction);

			expect(mockUserOrgs.update).toHaveBeenCalledWith(
				{ role: "owner" },
				{
					where: { userId: 1, tenantId: "tenant1", orgId: "org1" },
					transaction: mockTransaction,
				},
			);
		});
	});

	describe("getUserOrgs", () => {
		it("should return user orgs ordered by isDefault and lastAccessedAt", async () => {
			const mockUserOrgInstances = [
				{
					get: vi.fn().mockReturnValue({
						id: 1,
						userId: 1,
						tenantId: "tenant1",
						orgId: "org1",
						role: "admin",
						isDefault: true,
						lastAccessedAt: new Date("2025-01-20"),
						createdAt: new Date(),
					}),
				},
				{
					get: vi.fn().mockReturnValue({
						id: 2,
						userId: 1,
						tenantId: "tenant2",
						orgId: "org2",
						role: "member",
						isDefault: false,
						lastAccessedAt: new Date("2025-01-19"),
						createdAt: new Date(),
					}),
				},
			];

			vi.mocked(mockUserOrgs.findAll).mockResolvedValue(mockUserOrgInstances as never);

			const result = await userOrgDao.getUserOrgs(1);

			expect(mockUserOrgs.findAll).toHaveBeenCalledWith({
				where: { userId: 1 },
				order: [
					["isDefault", "DESC"],
					["lastAccessedAt", "DESC NULLS LAST"],
				],
			});
			expect(result).toHaveLength(2);
			expect(result[0].isDefault).toBe(true);
			expect(result[1].isDefault).toBe(false);
		});

		it("should return empty array when user has no orgs", async () => {
			vi.mocked(mockUserOrgs.findAll).mockResolvedValue([] as never);

			const result = await userOrgDao.getUserOrgs(999);

			expect(result).toEqual([]);
		});
	});

	describe("deleteUserOrg", () => {
		it("should delete user-org relationship", async () => {
			vi.mocked(mockUserOrgs.destroy).mockResolvedValue(1 as never);

			await userOrgDao.deleteUserOrg(1, "tenant1", "org1");

			expect(mockUserOrgs.destroy).toHaveBeenCalledWith({
				where: {
					userId: 1,
					tenantId: "tenant1",
					orgId: "org1",
				},
			});
		});

		it("should not fail when deleting non-existent user-org relationship", async () => {
			vi.mocked(mockUserOrgs.destroy).mockResolvedValue(0 as never);

			await userOrgDao.deleteUserOrg(999, "tenant999", "org999");

			expect(mockUserOrgs.destroy).toHaveBeenCalledWith({
				where: {
					userId: 999,
					tenantId: "tenant999",
					orgId: "org999",
				},
			});
		});
	});

	describe("getUniqueTenants", () => {
		it("should return unique tenants with default org for each", async () => {
			const mockTenants = [
				{
					tenantId: "tenant1",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					defaultOrgId: "org1",
				},
				{
					tenantId: "tenant2",
					tenantSlug: "widgets",
					tenantName: "Widgets Inc",
					defaultOrgId: "org2",
				},
			];

			vi.mocked(mockSequelize.query).mockResolvedValue(mockTenants as never);

			const result = await userOrgDao.getUniqueTenants(1);

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("DISTINCT ON"),
				expect.objectContaining({
					replacements: { userId: 1 },
				}),
			);
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				tenantId: "tenant1",
				tenantSlug: "acme",
				tenantName: "Acme Corp",
				defaultOrgId: "org1",
			});
		});

		it("should return empty array when user has no tenants", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([] as never);

			const result = await userOrgDao.getUniqueTenants(999);

			expect(result).toEqual([]);
		});
	});

	describe("getOrgsForTenant", () => {
		it("should return orgs for a specific tenant", async () => {
			const mockOrgs = [
				{
					orgId: "org1",
					orgSlug: "main",
					orgName: "Main Org",
					isDefault: true,
				},
				{
					orgId: "org2",
					orgSlug: "secondary",
					orgName: "Secondary Org",
					isDefault: false,
				},
			];

			vi.mocked(mockSequelize.query).mockResolvedValue(mockOrgs as never);

			const result = await userOrgDao.getOrgsForTenant(1, "tenant1");

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("WHERE uo.user_id = :userId AND uo.tenant_id = :tenantId"),
				expect.objectContaining({
					replacements: { userId: 1, tenantId: "tenant1" },
				}),
			);
			expect(result).toHaveLength(2);
			expect(result[0].orgId).toBe("org1");
			expect(result[0].isDefault).toBe(true);
		});

		it("should return empty array when user has no orgs in tenant", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([] as never);

			const result = await userOrgDao.getOrgsForTenant(1, "tenant-no-access");

			expect(result).toEqual([]);
		});
	});
});
