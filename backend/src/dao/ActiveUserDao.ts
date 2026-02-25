import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	type ActiveUser,
	defineActiveUsers,
	type NewActiveUser,
	type OrgUserRole,
	postSyncActiveUsers,
} from "../model/ActiveUser";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import { literal, type Sequelize, type Transaction } from "sequelize";

export interface ActiveUserDao {
	/** Find user by ID */
	findById(id: number): Promise<ActiveUser | undefined>;

	/** Find user by email */
	findByEmail(email: string): Promise<ActiveUser | undefined>;

	/** List all active users with optional pagination */
	listActive(options?: { limit?: number; offset?: number }): Promise<Array<ActiveUser>>;

	/** List all users (including inactive) with optional pagination */
	listAll(options?: { limit?: number; offset?: number }): Promise<Array<ActiveUser>>;

	/** List users by role */
	listByRole(role: OrgUserRole): Promise<Array<ActiveUser>>;

	/** Create a new user */
	create(user: NewActiveUser, transaction?: Transaction): Promise<ActiveUser>;

	/** Update user */
	update(
		id: number,
		updates: Partial<Omit<ActiveUser, "id" | "createdAt" | "updatedAt">>,
	): Promise<ActiveUser | undefined>;

	/** Deactivate user (lock) */
	deactivate(id: number): Promise<boolean>;

	/** Reactivate user (unlock) */
	reactivate(id: number): Promise<boolean>;

	/** Delete user (hard delete - used when removing user from tenant) */
	delete(id: number): Promise<boolean>;

	/** Count active users */
	countActive(): Promise<number>;

	/** Count all users (including inactive) */
	countAll(): Promise<number>;

	/** Count users by role */
	countByRole(role: OrgUserRole): Promise<number>;
}

export function createActiveUserDao(sequelize: Sequelize): ActiveUserDao & DaoPostSyncHook {
	const ActiveUsers = defineActiveUsers(sequelize);

	return {
		postSync,
		findById,
		findByEmail,
		listActive,
		listAll,
		listByRole,
		create,
		update,
		deactivate,
		reactivate,
		delete: deleteUser,
		countActive,
		countAll,
		countByRole,
	};

	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		await postSyncActiveUsers(sequelize);
	}

	async function findById(id: number): Promise<ActiveUser | undefined> {
		const user = await ActiveUsers.findByPk(id);
		return user ? user.get({ plain: true }) : undefined;
	}

	async function findByEmail(email: string): Promise<ActiveUser | undefined> {
		// Normalize email to lowercase for case-insensitive lookup
		const user = await ActiveUsers.findOne({ where: { email: email.toLowerCase() } });
		return user ? user.get({ plain: true }) : undefined;
	}

	async function listActive(options?: { limit?: number; offset?: number }): Promise<Array<ActiveUser>> {
		const findOptions: {
			where: { isActive: true };
			order: Array<[string, string]>;
			limit?: number;
			offset?: number;
		} = {
			where: { isActive: true },
			order: [["createdAt", "ASC"]],
		};
		if (options?.limit !== undefined) {
			findOptions.limit = options.limit;
		}
		if (options?.offset !== undefined) {
			findOptions.offset = options.offset;
		}
		const users = await ActiveUsers.findAll(findOptions);
		return users.map(u => u.get({ plain: true }));
	}

	async function listAll(options?: { limit?: number; offset?: number }): Promise<Array<ActiveUser>> {
		// Sort by role priority (owner first, then admin, then member), then by name
		const roleOrder = literal("CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END");
		const findOptions: {
			order: Array<[ReturnType<typeof literal>, string] | [string, string]>;
			limit?: number;
			offset?: number;
		} = {
			order: [
				[roleOrder, "ASC"],
				["name", "ASC"],
			],
		};
		if (options?.limit !== undefined) {
			findOptions.limit = options.limit;
		}
		if (options?.offset !== undefined) {
			findOptions.offset = options.offset;
		}
		const users = await ActiveUsers.findAll(findOptions);
		return users.map(u => u.get({ plain: true }));
	}

	async function listByRole(role: OrgUserRole): Promise<Array<ActiveUser>> {
		const users = await ActiveUsers.findAll({
			where: { role, isActive: true },
			order: [
				["name", "ASC"],
				["email", "ASC"],
			],
		});
		return users.map(u => u.get({ plain: true }));
	}

	async function create(user: NewActiveUser, transaction?: Transaction): Promise<ActiveUser> {
		// Normalize email to lowercase for consistent storage
		const normalizedUser = {
			...user,
			email: user.email.toLowerCase(),
		};
		const created = await ActiveUsers.create(normalizedUser as ActiveUser, { transaction: transaction ?? null });
		return created.get({ plain: true });
	}

	async function update(
		id: number,
		updates: Partial<Omit<ActiveUser, "id" | "createdAt" | "updatedAt">>,
	): Promise<ActiveUser | undefined> {
		const [count] = await ActiveUsers.update(updates, { where: { id } });
		if (count === 0) {
			return;
		}
		return findById(id);
	}

	async function deactivate(id: number): Promise<boolean> {
		const [count] = await ActiveUsers.update({ isActive: false }, { where: { id } });
		return count > 0;
	}

	async function reactivate(id: number): Promise<boolean> {
		const [count] = await ActiveUsers.update({ isActive: true }, { where: { id } });
		return count > 0;
	}

	async function deleteUser(id: number): Promise<boolean> {
		const count = await ActiveUsers.destroy({ where: { id } });
		return count > 0;
	}

	async function countActive(): Promise<number> {
		return await ActiveUsers.count({ where: { isActive: true } });
	}

	async function countAll(): Promise<number> {
		return await ActiveUsers.count();
	}

	async function countByRole(role: OrgUserRole): Promise<number> {
		return await ActiveUsers.count({ where: { role, isActive: true } });
	}
}

export function createActiveUserDaoProvider(defaultDao: ActiveUserDao): DaoProvider<ActiveUserDao> {
	return {
		getDao(context: TenantOrgContext | undefined): ActiveUserDao {
			return context?.database.activeUserDao ?? defaultDao;
		},
	};
}
