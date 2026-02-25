import type { OwnerInvitation } from "../model/OwnerInvitation";
import { defineOwnerInvitations } from "../model/OwnerInvitation";
import type { ModelDef } from "../util/ModelDef";
import { createOwnerInvitationDao, type OwnerInvitationDao } from "./OwnerInvitationDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OwnerInvitationDao", () => {
	let mockOwnerInvitations: ModelDef<OwnerInvitation>;
	let ownerInvitationDao: OwnerInvitationDao;
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockOwnerInvitations = {
			create: vi.fn(),
			findOne: vi.fn(),
			findByPk: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<OwnerInvitation>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockOwnerInvitations),
		} as unknown as Sequelize;

		ownerInvitationDao = createOwnerInvitationDao(mockSequelize);
	});

	describe("create", () => {
		it("should create an owner invitation record without transaction", async () => {
			const createdAt = new Date();
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					email: "owner@example.com",
					name: "Test Owner",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: null,
					createdAt,
					updatedAt: createdAt,
				}),
			};

			vi.mocked(mockOwnerInvitations.create).mockResolvedValue(mockResult as never);

			const invitation = await ownerInvitationDao.create({
				email: "Owner@Example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
			});

			expect(mockOwnerInvitations.create).toHaveBeenCalledWith(
				{
					email: "owner@example.com", // lowercase
					name: "Test Owner",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: null,
				},
				{ transaction: null },
			);
			expect(invitation.id).toBe(1);
			expect(invitation.email).toBe("owner@example.com");
			expect(invitation.name).toBe("Test Owner");
		});

		it("should create an owner invitation with transaction", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 2,
					email: "new@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 2,
					previousOwnerId: 10,
					verificationId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			};
			const mockTransaction = { id: "test-tx" } as never;

			vi.mocked(mockOwnerInvitations.create).mockResolvedValue(mockResult as never);

			const invitation = await ownerInvitationDao.create(
				{
					email: "new@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 2,
					previousOwnerId: 10,
				},
				mockTransaction,
			);

			expect(mockOwnerInvitations.create).toHaveBeenCalledWith(
				{
					email: "new@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 2,
					previousOwnerId: 10,
					verificationId: null,
				},
				{ transaction: mockTransaction },
			);
			expect(invitation.previousOwnerId).toBe(10);
		});

		it("should handle undefined optional fields", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 3,
					email: "minimal@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			};

			vi.mocked(mockOwnerInvitations.create).mockResolvedValue(mockResult as never);

			// Create without optional fields (undefined name and previousOwnerId)
			await ownerInvitationDao.create({
				email: "minimal@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
			});

			expect(mockOwnerInvitations.create).toHaveBeenCalledWith(
				{
					email: "minimal@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: null,
				},
				{ transaction: null },
			);
		});
	});

	describe("findById", () => {
		it("should find owner invitation by ID", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					email: "owner@example.com",
					name: "Test Owner",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: 5,
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			};

			vi.mocked(mockOwnerInvitations.findByPk).mockResolvedValue(mockResult as never);

			const found = await ownerInvitationDao.findById(1);

			expect(mockOwnerInvitations.findByPk).toHaveBeenCalledWith(1);
			expect(found).toBeDefined();
			expect(found?.id).toBe(1);
			expect(found?.verificationId).toBe(5);
		});

		it("should return undefined for non-existent ID", async () => {
			vi.mocked(mockOwnerInvitations.findByPk).mockResolvedValue(null);

			const found = await ownerInvitationDao.findById(999);

			expect(found).toBeUndefined();
		});
	});

	describe("findPendingByOrg", () => {
		it("should find pending invitation by tenant and org", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					email: "pending@example.com",
					name: "Pending Owner",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					verificationId: 10,
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
			};

			vi.mocked(mockOwnerInvitations.findOne).mockResolvedValue(mockResult as never);

			const found = await ownerInvitationDao.findPendingByOrg("tenant-123", "org-456");

			expect(mockOwnerInvitations.findOne).toHaveBeenCalledWith({
				where: {
					tenantId: "tenant-123",
					orgId: "org-456",
				},
				order: [["createdAt", "DESC"]],
			});
			expect(found).toBeDefined();
			expect(found?.email).toBe("pending@example.com");
		});

		it("should return undefined when no pending invitation exists", async () => {
			vi.mocked(mockOwnerInvitations.findOne).mockResolvedValue(null);

			const found = await ownerInvitationDao.findPendingByOrg("tenant-123", "org-456");

			expect(found).toBeUndefined();
		});
	});

	describe("updateVerificationId", () => {
		it("should update verification ID without transaction", async () => {
			vi.mocked(mockOwnerInvitations.update).mockResolvedValue([1] as never);

			await ownerInvitationDao.updateVerificationId(1, 100);

			expect(mockOwnerInvitations.update).toHaveBeenCalledWith(
				{ verificationId: 100 },
				{
					where: { id: 1 },
					transaction: null,
				},
			);
		});

		it("should update verification ID with transaction", async () => {
			vi.mocked(mockOwnerInvitations.update).mockResolvedValue([1] as never);
			const mockTransaction = { id: "test-tx" } as never;

			await ownerInvitationDao.updateVerificationId(1, 100, mockTransaction);

			expect(mockOwnerInvitations.update).toHaveBeenCalledWith(
				{ verificationId: 100 },
				{
					where: { id: 1 },
					transaction: mockTransaction,
				},
			);
		});
	});

	describe("cancelByOrg", () => {
		it("should cancel invitations by org without transaction", async () => {
			vi.mocked(mockOwnerInvitations.destroy).mockResolvedValue(2 as never);

			const cancelled = await ownerInvitationDao.cancelByOrg("tenant-123", "org-456");

			expect(mockOwnerInvitations.destroy).toHaveBeenCalledWith({
				where: {
					tenantId: "tenant-123",
					orgId: "org-456",
				},
				transaction: null,
			});
			expect(cancelled).toBe(2);
		});

		it("should cancel invitations by org with transaction", async () => {
			vi.mocked(mockOwnerInvitations.destroy).mockResolvedValue(1 as never);
			const mockTransaction = { id: "test-tx" } as never;

			const cancelled = await ownerInvitationDao.cancelByOrg("tenant-123", "org-456", mockTransaction);

			expect(mockOwnerInvitations.destroy).toHaveBeenCalledWith({
				where: {
					tenantId: "tenant-123",
					orgId: "org-456",
				},
				transaction: mockTransaction,
			});
			expect(cancelled).toBe(1);
		});

		it("should return 0 when no invitations to cancel", async () => {
			vi.mocked(mockOwnerInvitations.destroy).mockResolvedValue(0 as never);

			const cancelled = await ownerInvitationDao.cancelByOrg("tenant-123", "org-456");

			expect(cancelled).toBe(0);
		});
	});

	describe("delete", () => {
		it("should delete invitation by ID without transaction", async () => {
			vi.mocked(mockOwnerInvitations.destroy).mockResolvedValue(1 as never);

			await ownerInvitationDao.delete(1);

			expect(mockOwnerInvitations.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
				transaction: null,
			});
		});

		it("should delete invitation by ID with transaction", async () => {
			vi.mocked(mockOwnerInvitations.destroy).mockResolvedValue(1 as never);
			const mockTransaction = { id: "test-tx" } as never;

			await ownerInvitationDao.delete(1, mockTransaction);

			expect(mockOwnerInvitations.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
				transaction: mockTransaction,
			});
		});
	});
});

describe("defineOwnerInvitations", () => {
	it("should return existing model if already defined", () => {
		const existingModel = { name: "OwnerInvitation" } as unknown as ModelDef<OwnerInvitation>;
		const mockSequelize = {
			models: {
				OwnerInvitation: existingModel,
			},
			define: vi.fn(),
		} as unknown as Sequelize;

		const result = defineOwnerInvitations(mockSequelize);

		expect(result).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should define new model if not already defined", () => {
		const newModel = { name: "OwnerInvitation" } as unknown as ModelDef<OwnerInvitation>;
		const mockSequelize = {
			models: {},
			define: vi.fn().mockReturnValue(newModel),
		} as unknown as Sequelize;

		const result = defineOwnerInvitations(mockSequelize);

		expect(result).toBe(newModel);
		expect(mockSequelize.define).toHaveBeenCalledWith("OwnerInvitation", expect.any(Object), expect.any(Object));
	});

	it("should handle undefined models property", () => {
		const newModel = { name: "OwnerInvitation" } as unknown as ModelDef<OwnerInvitation>;
		const mockSequelize = {
			define: vi.fn().mockReturnValue(newModel),
		} as unknown as Sequelize;

		const result = defineOwnerInvitations(mockSequelize);

		expect(result).toBe(newModel);
		expect(mockSequelize.define).toHaveBeenCalled();
	});
});
