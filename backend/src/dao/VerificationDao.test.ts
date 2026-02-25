import type { Verification } from "../model/Verification";
import { defineVerifications } from "../model/Verification";
import type { ModelDef } from "../util/ModelDef";
import { createVerificationDao, type VerificationDao } from "./VerificationDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("VerificationDao", () => {
	let mockVerifications: ModelDef<Verification>;
	let verificationDao: VerificationDao;
	let mockSequelize: Sequelize;

	beforeEach(() => {
		mockVerifications = {
			create: vi.fn(),
			findOne: vi.fn(),
			findByPk: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<Verification>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockVerifications),
		} as unknown as Sequelize;

		verificationDao = createVerificationDao(mockSequelize);
	});

	describe("createVerification", () => {
		it("should create a verification record", async () => {
			const expiresAt = new Date(Date.now() + 3600000);
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					identifier: "test@example.com",
					tokenHash: "test-hash",
					type: "password_reset",
					expiresAt,
					usedAt: null,
					createdAt: new Date(),
				}),
			};

			vi.mocked(mockVerifications.create).mockResolvedValue(mockResult as never);

			const verification = await verificationDao.createVerification({
				identifier: "test@example.com",
				tokenHash: "test-hash",
				type: "password_reset",
				expiresAt,
			});

			expect(mockVerifications.create).toHaveBeenCalledWith({
				identifier: "test@example.com",
				tokenHash: "test-hash",
				type: "password_reset",
				expiresAt,
				value: null,
			});
			expect(verification.identifier).toBe("test@example.com");
			expect(verification.tokenHash).toBe("test-hash");
			expect(verification.type).toBe("password_reset");
			expect(verification.usedAt).toBe(null);
		});
	});

	describe("findByTokenHash", () => {
		it("should find verification by token hash", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					identifier: "test@example.com",
					tokenHash: "find-me",
					type: "password_reset",
					expiresAt: new Date(),
					usedAt: null,
					createdAt: new Date(),
				}),
			};

			vi.mocked(mockVerifications.findOne).mockResolvedValue(mockResult as never);

			const found = await verificationDao.findByTokenHash("find-me");

			expect(mockVerifications.findOne).toHaveBeenCalledWith({
				where: { tokenHash: "find-me" },
			});
			expect(found).toBeDefined();
			expect(found?.identifier).toBe("test@example.com");
		});

		it("should return undefined for non-existent token hash", async () => {
			vi.mocked(mockVerifications.findOne).mockResolvedValue(null);

			const found = await verificationDao.findByTokenHash("does-not-exist");

			expect(found).toBeUndefined();
		});
	});

	describe("findByResetPasswordToken", () => {
		it("should find verification by reset password token", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					identifier: "reset-password:test-token",
					value: "123",
					type: "password_reset",
					expiresAt: new Date(),
					usedAt: null,
					createdAt: new Date(),
				}),
			};

			vi.mocked(mockVerifications.findOne).mockResolvedValue(mockResult as never);

			const found = await verificationDao.findByResetPasswordToken("test-token");

			expect(mockVerifications.findOne).toHaveBeenCalledWith({
				where: { identifier: "reset-password:test-token" },
			});
			expect(found).toBeDefined();
			expect(found?.identifier).toBe("reset-password:test-token");
			expect(found?.value).toBe("123");
		});

		it("should return undefined for non-existent reset password token", async () => {
			vi.mocked(mockVerifications.findOne).mockResolvedValue(null);

			const found = await verificationDao.findByResetPasswordToken("does-not-exist");

			expect(found).toBeUndefined();
		});
	});

	describe("markAsUsed", () => {
		it("should mark verification as used without transaction", async () => {
			vi.mocked(mockVerifications.update).mockResolvedValue([1] as never);

			await verificationDao.markAsUsed(1);

			expect(mockVerifications.update).toHaveBeenCalledWith(
				{
					usedAt: expect.any(Date),
				},
				{
					where: { id: 1 },
					transaction: null,
				},
			);
		});

		it("should mark verification as used with transaction", async () => {
			vi.mocked(mockVerifications.update).mockResolvedValue([1] as never);
			const mockTransaction = { id: "test-tx" } as never;

			await verificationDao.markAsUsed(1, mockTransaction);

			expect(mockVerifications.update).toHaveBeenCalledWith(
				{
					usedAt: expect.any(Date),
				},
				{
					where: { id: 1 },
					transaction: mockTransaction,
				},
			);
		});
	});

	describe("findById", () => {
		it("should find verification by ID", async () => {
			const mockResult = {
				get: vi.fn().mockReturnValue({
					id: 1,
					identifier: "test@example.com",
					tokenHash: "test-hash",
					type: "password_reset",
					expiresAt: new Date(),
					usedAt: null,
					createdAt: new Date(),
				}),
			};

			vi.mocked(mockVerifications.findByPk).mockResolvedValue(mockResult as never);

			const found = await verificationDao.findById(1);

			expect(mockVerifications.findByPk).toHaveBeenCalledWith(1);
			expect(found).toBeDefined();
			expect(found?.id).toBe(1);
		});

		it("should return undefined for non-existent ID", async () => {
			vi.mocked(mockVerifications.findByPk).mockResolvedValue(null);

			const found = await verificationDao.findById(999);

			expect(found).toBeUndefined();
		});
	});

	describe("deleteVerification", () => {
		it("should delete verification record without transaction", async () => {
			vi.mocked(mockVerifications.destroy).mockResolvedValue(1 as never);

			await verificationDao.deleteVerification(1);

			expect(mockVerifications.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
				transaction: null,
			});
		});

		it("should delete verification record with transaction", async () => {
			vi.mocked(mockVerifications.destroy).mockResolvedValue(1 as never);
			const mockTransaction = { id: "test-tx" } as never;

			await verificationDao.deleteVerification(1, mockTransaction);

			expect(mockVerifications.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
				transaction: mockTransaction,
			});
		});
	});

	describe("deleteExpiredOrUsed", () => {
		it("should delete expired and used verifications", async () => {
			vi.mocked(mockVerifications.destroy)
				.mockResolvedValueOnce(2 as never) // expired count
				.mockResolvedValueOnce(1 as never); // used count

			const deleted = await verificationDao.deleteExpiredOrUsed();

			expect(mockVerifications.destroy).toHaveBeenCalledTimes(2);
			expect(deleted).toBe(3);
		});

		it("should return 0 when no records to delete", async () => {
			vi.mocked(mockVerifications.destroy)
				.mockResolvedValueOnce(0 as never)
				.mockResolvedValueOnce(0 as never);

			const deleted = await verificationDao.deleteExpiredOrUsed();

			expect(deleted).toBe(0);
		});
	});

	describe("deleteByIdentifierAndType", () => {
		it("should delete by identifier and type", async () => {
			vi.mocked(mockVerifications.destroy).mockResolvedValue(2 as never);

			const deleted = await verificationDao.deleteByIdentifierAndType("user@example.com", "password_reset");

			expect(mockVerifications.destroy).toHaveBeenCalledWith({
				where: {
					identifier: "user@example.com",
					type: "password_reset",
				},
			});
			expect(deleted).toBe(2);
		});

		it("should return 0 when deleting non-existent records", async () => {
			vi.mocked(mockVerifications.destroy).mockResolvedValue(0 as never);

			const deleted = await verificationDao.deleteByIdentifierAndType(
				"nonexistent@example.com",
				"password_reset",
			);

			expect(deleted).toBe(0);
		});
	});
});

describe("defineVerifications", () => {
	it("should return existing model if already defined", () => {
		const existingModel = { name: "Verification" } as unknown as ModelDef<Verification>;
		const mockSequelize = {
			models: {
				Verification: existingModel,
			},
			define: vi.fn(),
		} as unknown as Sequelize;

		const result = defineVerifications(mockSequelize);

		expect(result).toBe(existingModel);
		expect(mockSequelize.define).not.toHaveBeenCalled();
	});

	it("should define new model if not already defined", () => {
		const newModel = { name: "Verification" } as unknown as ModelDef<Verification>;
		const mockSequelize = {
			models: {},
			define: vi.fn().mockReturnValue(newModel),
		} as unknown as Sequelize;

		const result = defineVerifications(mockSequelize);

		expect(result).toBe(newModel);
		expect(mockSequelize.define).toHaveBeenCalledWith("Verification", expect.any(Object), expect.any(Object));
	});
});
