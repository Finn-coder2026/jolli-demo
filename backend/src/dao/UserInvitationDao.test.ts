import type { Database } from "../core/Database";
import type { NewUserInvitation, UserInvitation } from "../model/UserInvitation";
import { mockUserInvitation } from "../model/UserInvitation.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createUserInvitationDao, createUserInvitationDaoProvider, type UserInvitationDao } from "./UserInvitationDao";
import { Op, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("UserInvitationDao", () => {
	let mockUserInvitations: ModelDef<UserInvitation>;
	let mockSequelize: Sequelize;
	let userInvitationDao: ReturnType<typeof createUserInvitationDao>;

	beforeEach(() => {
		mockUserInvitations = {
			count: vi.fn(),
			create: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<UserInvitation>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockUserInvitations),
			query: vi.fn(),
		} as unknown as Sequelize;

		userInvitationDao = createUserInvitationDao(mockSequelize);
	});

	describe("postSync", () => {
		it("should call postSyncUserInvitations", async () => {
			const mockDb = {} as Database;
			await userInvitationDao.postSync(mockSequelize, mockDb);

			expect(mockSequelize.query).toHaveBeenCalled();
		});
	});

	describe("findById", () => {
		it("should return invitation when found", async () => {
			const invitation = mockUserInvitation({ id: 1 });
			const mockInstance = { get: vi.fn().mockReturnValue(invitation) };
			vi.mocked(mockUserInvitations.findByPk).mockResolvedValue(mockInstance as never);

			const result = await userInvitationDao.findById(1);

			expect(mockUserInvitations.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(invitation);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockUserInvitations.findByPk).mockResolvedValue(null);

			const result = await userInvitationDao.findById(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findPendingByEmail", () => {
		it("should return pending invitation for email", async () => {
			const invitation = mockUserInvitation({ email: "test@example.com", status: "pending" });
			const mockInstance = { get: vi.fn().mockReturnValue(invitation) };
			vi.mocked(mockUserInvitations.findOne).mockResolvedValue(mockInstance as never);

			const result = await userInvitationDao.findPendingByEmail("test@example.com");

			expect(mockUserInvitations.findOne).toHaveBeenCalledWith({
				where: { email: "test@example.com", status: "pending" },
			});
			expect(result).toEqual(invitation);
		});

		it("should return undefined when no pending invitation", async () => {
			vi.mocked(mockUserInvitations.findOne).mockResolvedValue(null);

			const result = await userInvitationDao.findPendingByEmail("nonexistent@example.com");

			expect(result).toBeUndefined();
		});

		it("should normalize email to lowercase for lookup", async () => {
			const invitation = mockUserInvitation({ email: "test@example.com", status: "pending" });
			const mockInstance = { get: vi.fn().mockReturnValue(invitation) };
			vi.mocked(mockUserInvitations.findOne).mockResolvedValue(mockInstance as never);

			// Search with mixed-case email
			const result = await userInvitationDao.findPendingByEmail("Test@Example.COM");

			// Should search with lowercase email
			expect(mockUserInvitations.findOne).toHaveBeenCalledWith({
				where: { email: "test@example.com", status: "pending" },
			});
			expect(result).toEqual(invitation);
		});
	});

	describe("listPending", () => {
		it("should return pending invitations ordered by createdAt ASC", async () => {
			const invitations = [mockUserInvitation({ id: 1 }), mockUserInvitation({ id: 2 })];
			const mockInstances = invitations.map(i => ({ get: vi.fn().mockReturnValue(i) }));
			vi.mocked(mockUserInvitations.findAll).mockResolvedValue(mockInstances as never);

			const result = await userInvitationDao.listPending();

			expect(mockUserInvitations.findAll).toHaveBeenCalledWith({
				where: { status: "pending" },
				order: [["createdAt", "ASC"]],
			});
			expect(result).toEqual(invitations);
		});

		it("should support pagination with limit and offset", async () => {
			const invitations = [mockUserInvitation({ id: 1 })];
			const mockInstances = invitations.map(i => ({ get: vi.fn().mockReturnValue(i) }));
			vi.mocked(mockUserInvitations.findAll).mockResolvedValue(mockInstances as never);

			const result = await userInvitationDao.listPending({ limit: 10, offset: 20 });

			expect(mockUserInvitations.findAll).toHaveBeenCalledWith({
				where: { status: "pending" },
				order: [["createdAt", "ASC"]],
				limit: 10,
				offset: 20,
			});
			expect(result).toEqual(invitations);
		});
	});

	describe("listByInviter", () => {
		it("should return invitations by inviter", async () => {
			const invitations = [mockUserInvitation({ id: 1, invitedBy: 10 })];
			const mockInstances = invitations.map(i => ({ get: vi.fn().mockReturnValue(i) }));
			vi.mocked(mockUserInvitations.findAll).mockResolvedValue(mockInstances as never);

			const result = await userInvitationDao.listByInviter(10);

			expect(mockUserInvitations.findAll).toHaveBeenCalledWith({
				where: { invitedBy: 10 },
				order: [["createdAt", "DESC"]],
			});
			expect(result).toEqual(invitations);
		});
	});

	describe("create", () => {
		it("should create an invitation", async () => {
			const newInvitation: NewUserInvitation = {
				email: "new@example.com",
				invitedBy: 1,
				role: "member",
				name: null,
				verificationId: null,
				expiresAt: new Date(),
				status: "pending",
			};
			const createdInvitation = mockUserInvitation(newInvitation);
			const mockInstance = { get: vi.fn().mockReturnValue(createdInvitation) };
			vi.mocked(mockUserInvitations.create).mockResolvedValue(mockInstance as never);

			const result = await userInvitationDao.create(newInvitation);

			expect(mockUserInvitations.create).toHaveBeenCalledWith(newInvitation);
			expect(result).toEqual(createdInvitation);
		});

		it("should normalize email to lowercase when creating invitation", async () => {
			const expiresAt = new Date();
			const newInvitation: NewUserInvitation = {
				email: "New@Example.COM",
				invitedBy: 1,
				role: "member",
				name: null,
				verificationId: null,
				expiresAt,
				status: "pending",
			};
			const createdInvitation = mockUserInvitation({ ...newInvitation, email: "new@example.com" });
			const mockInstance = { get: vi.fn().mockReturnValue(createdInvitation) };
			vi.mocked(mockUserInvitations.create).mockResolvedValue(mockInstance as never);

			const result = await userInvitationDao.create(newInvitation);

			// Should create with lowercase email
			expect(mockUserInvitations.create).toHaveBeenCalledWith({
				email: "new@example.com",
				invitedBy: 1,
				role: "member",
				name: null,
				verificationId: null,
				expiresAt,
				status: "pending",
			});
			expect(result).toEqual(createdInvitation);
		});
	});

	describe("findByVerificationId", () => {
		it("should return invitation when found by verificationId", async () => {
			const invitation = mockUserInvitation({ id: 1, verificationId: 100 });
			const mockInstance = { get: vi.fn().mockReturnValue(invitation) };
			vi.mocked(mockUserInvitations.findOne).mockResolvedValue(mockInstance as never);

			const result = await userInvitationDao.findByVerificationId(100);

			expect(mockUserInvitations.findOne).toHaveBeenCalledWith({
				where: { verificationId: 100 },
			});
			expect(result).toEqual(invitation);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockUserInvitations.findOne).mockResolvedValue(null);

			const result = await userInvitationDao.findByVerificationId(999);

			expect(result).toBeUndefined();
		});
	});

	describe("updateVerificationId", () => {
		it("should update verification ID", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([1] as never);

			const result = await userInvitationDao.updateVerificationId(1, 100);

			expect(mockUserInvitations.update).toHaveBeenCalledWith({ verificationId: 100 }, { where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows updated", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([0] as never);

			const result = await userInvitationDao.updateVerificationId(999, 100);

			expect(result).toBe(false);
		});
	});

	describe("markAccepted", () => {
		it("should mark invitation as accepted and return true", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([1] as never);

			const result = await userInvitationDao.markAccepted(1);

			expect(mockUserInvitations.update).toHaveBeenCalledWith(
				{ status: "accepted" },
				{ where: { id: 1, status: "pending" }, transaction: null },
			);
			expect(result).toBe(true);
		});

		it("should return false when no rows updated", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([0] as never);

			const result = await userInvitationDao.markAccepted(999);

			expect(result).toBe(false);
		});
	});

	describe("markExpired", () => {
		it("should mark invitation as expired and return true", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([1] as never);

			const result = await userInvitationDao.markExpired(1);

			expect(mockUserInvitations.update).toHaveBeenCalledWith(
				{ status: "expired" },
				{ where: { id: 1, status: "pending" } },
			);
			expect(result).toBe(true);
		});

		it("should return false when no rows updated", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([0] as never);

			const result = await userInvitationDao.markExpired(999);

			expect(result).toBe(false);
		});
	});

	describe("expireOldInvitations", () => {
		it("should expire old pending invitations and return count", async () => {
			vi.mocked(mockUserInvitations.update).mockResolvedValue([5] as never);

			const result = await userInvitationDao.expireOldInvitations();

			expect(mockUserInvitations.update).toHaveBeenCalledWith(
				{ status: "expired" },
				{
					where: {
						status: "pending",
						expiresAt: { [Op.lt]: expect.any(Date) },
					},
				},
			);
			expect(result).toBe(5);
		});
	});

	describe("delete", () => {
		it("should delete invitation and return true", async () => {
			vi.mocked(mockUserInvitations.destroy).mockResolvedValue(1);

			const result = await userInvitationDao.delete(1);

			expect(mockUserInvitations.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows deleted", async () => {
			vi.mocked(mockUserInvitations.destroy).mockResolvedValue(0);

			const result = await userInvitationDao.delete(999);

			expect(result).toBe(false);
		});
	});

	describe("countPending", () => {
		it("should return count of pending invitations", async () => {
			vi.mocked(mockUserInvitations.count).mockResolvedValue(15);

			const result = await userInvitationDao.countPending();

			expect(mockUserInvitations.count).toHaveBeenCalledWith({ where: { status: "pending" } });
			expect(result).toBe(15);
		});
	});
});

describe("createUserInvitationDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as UserInvitationDao;
		const provider = createUserInvitationDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context userInvitationDao when context has database", () => {
		const defaultDao = {} as UserInvitationDao;
		const contextUserInvitationDao = {} as UserInvitationDao;
		const context = {
			database: {
				userInvitationDao: contextUserInvitationDao,
			},
		} as TenantOrgContext;

		const provider = createUserInvitationDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextUserInvitationDao);
	});
});
