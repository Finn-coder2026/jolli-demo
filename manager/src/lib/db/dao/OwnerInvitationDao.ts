import type { NewOwnerInvitation, OwnerInvitation, OwnerInvitationRow } from "../models";
import { defineOwnerInvitations, toOwnerInvitation } from "../models";
import type { Sequelize } from "sequelize";

export interface OwnerInvitationDao {
	/**
	 * Create a new owner invitation record
	 */
	create(invitation: NewOwnerInvitation): Promise<OwnerInvitation>;

	/**
	 * Find owner invitation by ID
	 */
	findById(id: number): Promise<OwnerInvitation | undefined>;

	/**
	 * Find pending owner invitation by org (not expired, verificationId set)
	 */
	findPendingByOrg(tenantId: string, orgId: string): Promise<OwnerInvitation | undefined>;

	/**
	 * Update verificationId for an owner invitation
	 */
	updateVerificationId(id: number, verificationId: number): Promise<void>;

	/**
	 * Cancel (delete) pending owner invitations by org
	 * Returns the number of deleted records
	 */
	cancelByOrg(tenantId: string, orgId: string): Promise<number>;

	/**
	 * Delete an owner invitation by ID
	 */
	delete(id: number): Promise<void>;
}

export function createOwnerInvitationDao(sequelize: Sequelize): OwnerInvitationDao {
	const OwnerInvitations = defineOwnerInvitations(sequelize);

	async function create(invitation: NewOwnerInvitation): Promise<OwnerInvitation> {
		// Normalize email to lowercase for consistent storage
		const row = await OwnerInvitations.create({
			verificationId: invitation.verificationId ?? null,
			email: invitation.email.toLowerCase(),
			name: invitation.name ?? null,
			tenantId: invitation.tenantId,
			orgId: invitation.orgId,
			invitedBy: invitation.invitedBy,
			previousOwnerId: invitation.previousOwnerId ?? null,
		} as unknown as OwnerInvitationRow);
		return toOwnerInvitation(row.dataValues);
	}

	async function findById(id: number): Promise<OwnerInvitation | undefined> {
		const row = await OwnerInvitations.findByPk(id);
		if (!row) {
			return;
		}
		return toOwnerInvitation(row.dataValues);
	}

	async function findPendingByOrg(tenantId: string, orgId: string): Promise<OwnerInvitation | undefined> {
		// Find owner invitation where verificationId is set (invitation is complete/pending)
		const row = await OwnerInvitations.findOne({
			where: {
				tenantId,
				orgId,
			},
			order: [["createdAt", "DESC"]],
		});
		if (!row) {
			return;
		}
		return toOwnerInvitation(row.dataValues);
	}

	async function updateVerificationId(id: number, verificationId: number): Promise<void> {
		await OwnerInvitations.update({ verificationId } as unknown as OwnerInvitationRow, {
			where: { id },
		});
	}

	async function cancelByOrg(tenantId: string, orgId: string): Promise<number> {
		const result = await OwnerInvitations.destroy({
			where: {
				tenantId,
				orgId,
			},
		});
		return result;
	}

	async function deleteById(id: number): Promise<void> {
		await OwnerInvitations.destroy({
			where: { id },
		});
	}

	return {
		create,
		findById,
		findPendingByOrg,
		updateVerificationId,
		cancelByOrg,
		delete: deleteById,
	};
}
