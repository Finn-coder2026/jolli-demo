import type { Database } from "../core/Database";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { ActiveUserProvisioningService } from "./ActiveUserProvisioningService";
import type { Org, Tenant } from "jolli-common";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ActiveUserProvisioningService", () => {
	let service: ActiveUserProvisioningService;
	let mockRegistryClient: TenantRegistryClient;
	let mockConnectionManager: TenantOrgConnectionManager;
	let mockDatabase: Database;
	let mockSequelize: Sequelize;
	let mockActiveUserDao: ActiveUserDao;
	let mockSpaceDao: SpaceDao;

	const mockTenant: Tenant = {
		id: "tenant1",
		slug: "acme",
		displayName: "Acme Corp",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "default",
		createdAt: new Date(),
		updatedAt: new Date(),
		provisionedAt: new Date(),
		primaryDomain: null,
		configs: {},
		featureFlags: {},
		configsUpdatedAt: null,
	};

	const mockOrg: Org = {
		id: "org1",
		tenantId: "tenant1",
		slug: "main",
		displayName: "Main Org",
		schemaName: "org_main",
		status: "active",
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(() => {
		mockActiveUserDao = {
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		} as unknown as ActiveUserDao;

		mockSpaceDao = {
			createPersonalSpaceIfNeeded: vi.fn(),
		} as unknown as SpaceDao;

		mockSequelize = {
			query: vi.fn(),
		} as unknown as Sequelize;

		mockDatabase = {
			activeUserDao: mockActiveUserDao,
			spaceDao: mockSpaceDao,
			sequelize: mockSequelize,
		} as unknown as Database;

		mockRegistryClient = {
			getTenant: vi.fn(),
			getOrg: vi.fn(),
		} as unknown as TenantRegistryClient;

		mockConnectionManager = {
			getConnection: vi.fn(),
		} as unknown as TenantOrgConnectionManager;

		service = new ActiveUserProvisioningService({
			registryClient: mockRegistryClient,
			connectionManager: mockConnectionManager,
		});
	});

	describe("isUserInactiveInTenant", () => {
		it("should return true when user exists and is inactive", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: false,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(true);
		});

		it("should return false when user exists and is active", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(false);
		});

		it("should return false when user does not exist yet", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(false);
		});

		it("should return false when tenant or org not found", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(false);
		});

		it("should return false when active_users table does not exist", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: false }] as never);

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(false);
		});

		it("should return false when database query fails", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockRejectedValue(new Error("Database error"));

			const result = await service.isUserInactiveInTenant(1, "tenant1", "org1");

			expect(result).toBe(false);
		});
	});

	describe("ensureActiveUser", () => {
		it("should create active_users record when user does not exist", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: "https://example.com/avatar.jpg",
				role: "owner",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.jpg",
				tenantId: "tenant1",
				orgId: "org1",
				role: "owner",
			});

			expect(result).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalledWith({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: "https://example.com/avatar.jpg",
				role: "owner",
				roleId: null,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
			});
		});

		it("should return false when user already exists", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "admin",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "admin",
			});

			expect(result).toBe(false);
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
		});

		it("should not overwrite active_users role even when user_orgs role differs", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "admin",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			// active_users is the source of truth; role should not be overwritten
			expect(result).toBe(false);
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
			expect(mockActiveUserDao.update).not.toHaveBeenCalled();
		});

		it("should return false when active_users table does not exist", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: false }] as never);

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(result).toBe(false);
			expect(mockActiveUserDao.findById).not.toHaveBeenCalled();
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
		});

		it("should throw error when tenant not found", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

			await expect(
				service.ensureActiveUser({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: null,
					tenantId: "tenant1",
					orgId: "org1",
					role: "member",
				}),
			).rejects.toThrow("Tenant or org not found");
		});

		it("should throw error when org not found", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

			await expect(
				service.ensureActiveUser({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: null,
					tenantId: "tenant1",
					orgId: "org1",
					role: "member",
				}),
			).rejects.toThrow("Tenant or org not found");
		});

		it("should handle name as null", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: null,
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: null,
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(result).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalledWith({
				id: 1,
				email: "test@example.com",
				name: null,
				image: null,
				role: "member",
				roleId: null,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
			});
		});

		it("should default to member role when role is empty", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "",
			});

			expect(result).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({
					role: "member",
				}),
			);
		});

		it("should throw error when database operation fails", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockRejectedValue(new Error("Database error"));

			await expect(
				service.ensureActiveUser({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: null,
					tenantId: "tenant1",
					orgId: "org1",
					role: "member",
				}),
			).rejects.toThrow("Database error");
		});

		it("should handle empty table check result", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([] as never);

			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(result).toBe(false);
			expect(mockActiveUserDao.findById).not.toHaveBeenCalled();
		});

		it("should create personal space for new users", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(mockSpaceDao.createPersonalSpaceIfNeeded).toHaveBeenCalledWith(1);
		});

		it("should create personal space for existing users", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(mockSpaceDao.createPersonalSpaceIfNeeded).toHaveBeenCalledWith(1);
		});

		it("should not fail provisioning when personal space creation fails", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);
			vi.mocked(mockSequelize.query).mockResolvedValue([{ table_exists: true }] as never);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.create).mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: null,
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockSpaceDao.createPersonalSpaceIfNeeded).mockRejectedValue(new Error("Space creation failed"));

			// Should not throw — personal space failure is non-critical
			const result = await service.ensureActiveUser({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: null,
				tenantId: "tenant1",
				orgId: "org1",
				role: "member",
			});

			expect(result).toBe(true);
			expect(mockSpaceDao.createPersonalSpaceIfNeeded).toHaveBeenCalledWith(1);
		});
	});
});
