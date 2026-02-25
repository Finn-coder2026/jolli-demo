import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	defineUserInvitations,
	type InvitationStatus,
	type NewUserInvitation,
	postSyncUserInvitations,
	type UserInvitation,
} from "../model/UserInvitation";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import { Op, type Sequelize, type Transaction } from "sequelize";

export interface UserInvitationDao {
	/** Find invitation by ID */
	findById(id: number): Promise<UserInvitation | undefined>;

	/** Find pending invitation by email */
	findPendingByEmail(email: string): Promise<UserInvitation | undefined>;

	/** Find invitation by verification ID */
	findByVerificationId(verificationId: number): Promise<UserInvitation | undefined>;

	/** List all pending invitations with optional pagination */
	listPending(options?: { limit?: number; offset?: number }): Promise<Array<UserInvitation>>;

	/** List invitations by inviter */
	listByInviter(invitedBy: number): Promise<Array<UserInvitation>>;

	/** Create a new invitation */
	create(invitation: NewUserInvitation): Promise<UserInvitation>;

	/** Update verification ID for an invitation */
	updateVerificationId(id: number, verificationId: number): Promise<boolean>;

	/** Mark invitation as accepted */
	markAccepted(id: number, transaction?: Transaction): Promise<boolean>;

	/** Mark invitation as expired */
	markExpired(id: number): Promise<boolean>;

	/** Expire all invitations past their expiry date */
	expireOldInvitations(): Promise<number>;

	/** Delete invitation */
	delete(id: number): Promise<boolean>;

	/** Count pending invitations */
	countPending(): Promise<number>;
}

export function createUserInvitationDao(sequelize: Sequelize): UserInvitationDao & DaoPostSyncHook {
	const UserInvitations = defineUserInvitations(sequelize);

	return {
		postSync,
		findById,
		findPendingByEmail,
		findByVerificationId,
		listPending,
		listByInviter,
		create,
		updateVerificationId,
		markAccepted,
		markExpired,
		expireOldInvitations,
		delete: deleteInvitation,
		countPending,
	};

	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		await postSyncUserInvitations(sequelize);
	}

	async function findById(id: number): Promise<UserInvitation | undefined> {
		const invitation = await UserInvitations.findByPk(id);
		return invitation ? invitation.get({ plain: true }) : undefined;
	}

	async function findPendingByEmail(email: string): Promise<UserInvitation | undefined> {
		// Normalize email to lowercase for case-insensitive lookup
		const invitation = await UserInvitations.findOne({
			where: { email: email.toLowerCase(), status: "pending" },
		});
		return invitation ? invitation.get({ plain: true }) : undefined;
	}

	async function findByVerificationId(verificationId: number): Promise<UserInvitation | undefined> {
		const invitation = await UserInvitations.findOne({
			where: { verificationId },
		});
		return invitation ? invitation.get({ plain: true }) : undefined;
	}

	async function listPending(options?: { limit?: number; offset?: number }): Promise<Array<UserInvitation>> {
		const findOptions: {
			where: { status: string };
			order: Array<[string, string]>;
			limit?: number;
			offset?: number;
		} = {
			where: { status: "pending" },
			order: [["createdAt", "ASC"]],
		};
		if (options?.limit !== undefined) {
			findOptions.limit = options.limit;
		}
		if (options?.offset !== undefined) {
			findOptions.offset = options.offset;
		}
		const invitations = await UserInvitations.findAll(findOptions);
		return invitations.map(i => i.get({ plain: true }));
	}

	async function listByInviter(invitedBy: number): Promise<Array<UserInvitation>> {
		const invitations = await UserInvitations.findAll({
			where: { invitedBy },
			order: [["createdAt", "DESC"]],
		});
		return invitations.map(i => i.get({ plain: true }));
	}

	async function create(invitation: NewUserInvitation): Promise<UserInvitation> {
		// Normalize email to lowercase for consistent storage
		const normalizedInvitation = {
			...invitation,
			email: invitation.email.toLowerCase(),
		};
		const created = await UserInvitations.create(normalizedInvitation as UserInvitation);
		return created.get({ plain: true });
	}

	async function updateVerificationId(id: number, verificationId: number): Promise<boolean> {
		const [count] = await UserInvitations.update({ verificationId }, { where: { id } });
		return count > 0;
	}

	async function markAccepted(id: number, transaction?: Transaction): Promise<boolean> {
		const [count] = await UserInvitations.update(
			{ status: "accepted" as InvitationStatus },
			{ where: { id, status: "pending" }, transaction: transaction ?? null },
		);
		return count > 0;
	}

	async function markExpired(id: number): Promise<boolean> {
		const [count] = await UserInvitations.update(
			{ status: "expired" as InvitationStatus },
			{ where: { id, status: "pending" } },
		);
		return count > 0;
	}

	async function expireOldInvitations(): Promise<number> {
		const [count] = await UserInvitations.update(
			{ status: "expired" as InvitationStatus },
			{
				where: {
					status: "pending",
					expiresAt: { [Op.lt]: new Date() },
				},
			},
		);
		return count;
	}

	async function deleteInvitation(id: number): Promise<boolean> {
		const count = await UserInvitations.destroy({ where: { id } });
		return count > 0;
	}

	async function countPending(): Promise<number> {
		return await UserInvitations.count({ where: { status: "pending" } });
	}
}

export function createUserInvitationDaoProvider(defaultDao: UserInvitationDao): DaoProvider<UserInvitationDao> {
	return {
		getDao(context: TenantOrgContext | undefined): UserInvitationDao {
			return context?.database.userInvitationDao ?? defaultDao;
		},
	};
}
