import type { Verification, VerificationType } from "../model/Verification.js";
import { defineVerifications } from "../model/Verification.js";
import type { Sequelize, Transaction } from "sequelize";
import { Op } from "sequelize";

/**
 * Data Access Object for verifications (one-time tokens)
 */
export interface VerificationDao {
	/**
	 * Create a new verification token
	 */
	createVerification(data: {
		identifier: string;
		tokenHash: string;
		type: VerificationType;
		expiresAt: Date;
		value?: string | null;
	}): Promise<Verification>;

	/**
	 * Find verification by ID
	 */
	findById(id: number): Promise<Verification | undefined>;

	/**
	 * Find verification by token hash
	 */
	findByTokenHash(tokenHash: string): Promise<Verification | undefined>;

	/**
	 * Find verification by reset password token (better-auth format: identifier = "reset-password:token")
	 */
	findByResetPasswordToken(token: string): Promise<Verification | undefined>;

	/**
	 * Mark verification as used
	 */
	markAsUsed(id: number, transaction?: Transaction): Promise<void>;

	/**
	 * Delete verification by ID
	 */
	deleteVerification(id: number, transaction?: Transaction): Promise<void>;

	/**
	 * Delete all expired or used verifications (cleanup)
	 */
	deleteExpiredOrUsed(): Promise<number>;

	/**
	 * Delete all verifications for an identifier and type
	 * (useful when creating a new token to invalidate old ones)
	 */
	deleteByIdentifierAndType(identifier: string, type: VerificationType): Promise<number>;
}

/**
 * Create a VerificationDao instance
 */
export function createVerificationDao(sequelize: Sequelize): VerificationDao {
	const Verifications = defineVerifications(sequelize);

	return {
		createVerification,
		findById,
		findByTokenHash,
		findByResetPasswordToken,
		markAsUsed,
		deleteVerification,
		deleteExpiredOrUsed,
		deleteByIdentifierAndType,
	};

	async function createVerification(data: {
		identifier: string;
		tokenHash: string;
		type: VerificationType;
		expiresAt: Date;
		value?: string | null;
	}): Promise<Verification> {
		const result = await Verifications.create({
			identifier: data.identifier,
			tokenHash: data.tokenHash,
			type: data.type,
			expiresAt: data.expiresAt,
			value: data.value ?? null,
		} as never);
		return result.get({ plain: true }) as Verification;
	}

	async function findById(id: number): Promise<Verification | undefined> {
		const result = await Verifications.findByPk(id);
		return result ? (result.get({ plain: true }) as Verification) : undefined;
	}

	async function findByTokenHash(tokenHash: string): Promise<Verification | undefined> {
		const result = await Verifications.findOne({
			where: { tokenHash },
		});
		return result ? (result.get({ plain: true }) as Verification) : undefined;
	}

	async function findByResetPasswordToken(token: string): Promise<Verification | undefined> {
		const identifier = `reset-password:${token}`;
		const result = await Verifications.findOne({
			where: { identifier },
		});
		return result ? (result.get({ plain: true }) as Verification) : undefined;
	}

	async function markAsUsed(id: number, transaction?: Transaction): Promise<void> {
		await Verifications.update(
			{
				usedAt: new Date(),
			},
			{
				where: { id },
				transaction: transaction ?? null,
			},
		);
	}

	async function deleteVerification(id: number, transaction?: Transaction): Promise<void> {
		await Verifications.destroy({
			where: { id },
			transaction: transaction ?? null,
		});
	}

	async function deleteExpiredOrUsed(): Promise<number> {
		const now = new Date();
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		// Delete expired tokens
		const expiredCount = await Verifications.destroy({
			where: {
				expiresAt: {
					[Op.lt]: now,
				},
			},
		});

		// Delete used tokens older than 1 day (for audit trail)
		const usedCount = await Verifications.destroy({
			where: {
				usedAt: {
					[Op.lt]: oneDayAgo,
				},
			},
		});

		return expiredCount + usedCount;
	}

	async function deleteByIdentifierAndType(identifier: string, type: VerificationType): Promise<number> {
		const result = await Verifications.destroy({
			where: {
				identifier,
				type,
			},
		});
		return result;
	}
}
