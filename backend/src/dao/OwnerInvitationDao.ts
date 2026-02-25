import type { NewOwnerInvitation, OwnerInvitation } from "../model/OwnerInvitation.js";
import { defineOwnerInvitations } from "../model/OwnerInvitation.js";
import type { Sequelize, Transaction } from "sequelize";

/**
 * Data Access Object for owner invitations.
 * Stored in Manager DB (registry database).
 */
export interface OwnerInvitationDao {
	/**
	 * Create a new owner invitation record
	 */
	create(invitation: NewOwnerInvitation, transaction?: Transaction): Promise<OwnerInvitation>;

	/**
	 * Find owner invitation by ID
	 */
	findById(id: number): Promise<OwnerInvitation | undefined>;

	/**
	 * Find pending (non-cancelled) owner invitation by org
	 * Returns the most recent pending invitation for the tenant-org combination
	 */
	findPendingByOrg(tenantId: string, orgId: string): Promise<OwnerInvitation | undefined>;

	/**
	 * Update verification ID for an owner invitation
	 */
	updateVerificationId(id: number, verificationId: number, transaction?: Transaction): Promise<void>;

	/**
	 * Cancel (delete) pending owner invitations by org
	 * Returns the number of cancelled invitations
	 */
	cancelByOrg(tenantId: string, orgId: string, transaction?: Transaction): Promise<number>;

	/**
	 * Delete an owner invitation by ID
	 */
	delete(id: number, transaction?: Transaction): Promise<void>;
}

/**
 * Create an OwnerInvitationDao instance
 */
export function createOwnerInvitationDao(sequelize: Sequelize): OwnerInvitationDao {
	const OwnerInvitations = defineOwnerInvitations(sequelize);

	return {
		create,
		findById,
		findPendingByOrg,
		updateVerificationId,
		cancelByOrg,
		delete: deleteById,
	};

	async function create(invitation: NewOwnerInvitation, transaction?: Transaction): Promise<OwnerInvitation> {
		const result = await OwnerInvitations.create(
			{
				email: invitation.email.toLowerCase(),
				name: invitation.name ?? null,
				tenantId: invitation.tenantId,
				orgId: invitation.orgId,
				invitedBy: invitation.invitedBy,
				previousOwnerId: invitation.previousOwnerId ?? null,
				verificationId: null, // Will be updated after verification record is created
			} as never,
			{ transaction: transaction ?? null },
		);
		return result.get({ plain: true }) as OwnerInvitation;
	}

	async function findById(id: number): Promise<OwnerInvitation | undefined> {
		const result = await OwnerInvitations.findByPk(id);
		return result ? (result.get({ plain: true }) as OwnerInvitation) : undefined;
	}

	async function findPendingByOrg(tenantId: string, orgId: string): Promise<OwnerInvitation | undefined> {
		// Find the most recent pending invitation for this tenant-org
		// A pending invitation has a verificationId (linked to active verification)
		const result = await OwnerInvitations.findOne({
			where: {
				tenantId,
				orgId,
			},
			order: [["createdAt", "DESC"]],
		});
		return result ? (result.get({ plain: true }) as OwnerInvitation) : undefined;
	}

	async function updateVerificationId(id: number, verificationId: number, transaction?: Transaction): Promise<void> {
		await OwnerInvitations.update(
			{ verificationId },
			{
				where: { id },
				transaction: transaction ?? null,
			},
		);
	}

	async function cancelByOrg(tenantId: string, orgId: string, transaction?: Transaction): Promise<number> {
		const result = await OwnerInvitations.destroy({
			where: {
				tenantId,
				orgId,
			},
			transaction: transaction ?? null,
		});
		return result;
	}

	async function deleteById(id: number, transaction?: Transaction): Promise<void> {
		await OwnerInvitations.destroy({
			where: { id },
			transaction: transaction ?? null,
		});
	}
}
