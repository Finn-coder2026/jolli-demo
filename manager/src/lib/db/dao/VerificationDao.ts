import type { NewVerification, Verification, VerificationRow } from "../models/VerificationModel";
import { defineVerifications, toVerification } from "../models/VerificationModel";
import type { Sequelize, Transaction } from "sequelize";

export interface VerificationDao {
	/**
	 * Create a new verification record
	 */
	create(verification: NewVerification, transaction?: Transaction): Promise<Verification>;

	/**
	 * Find verification by ID
	 */
	findById(id: number): Promise<Verification | undefined>;

	/**
	 * Find verification by token hash
	 */
	findByTokenHash(tokenHash: string): Promise<Verification | undefined>;

	/**
	 * Delete a verification record by ID
	 */
	delete(id: number, transaction?: Transaction): Promise<void>;
}

export function createVerificationDao(sequelize: Sequelize): VerificationDao {
	const Verifications = defineVerifications(sequelize);

	async function create(verification: NewVerification, transaction?: Transaction): Promise<Verification> {
		const row = await Verifications.create(
			{
				identifier: verification.identifier,
				tokenHash: verification.tokenHash ?? null,
				value: verification.value ?? null,
				type: verification.type ?? null,
				expiresAt: verification.expiresAt,
			} as unknown as VerificationRow,
			{ transaction: transaction ?? null },
		);
		return toVerification(row.dataValues);
	}

	async function findById(id: number): Promise<Verification | undefined> {
		const row = await Verifications.findByPk(id);
		if (!row) {
			return;
		}
		return toVerification(row.dataValues);
	}

	async function findByTokenHash(tokenHash: string): Promise<Verification | undefined> {
		const row = await Verifications.findOne({
			where: { tokenHash },
		});
		if (!row) {
			return;
		}
		return toVerification(row.dataValues);
	}

	async function deleteById(id: number, transaction?: Transaction): Promise<void> {
		await Verifications.destroy({
			where: { id },
			transaction: transaction ?? null,
		});
	}

	return {
		create,
		findById,
		findByTokenHash,
		delete: deleteById,
	};
}
