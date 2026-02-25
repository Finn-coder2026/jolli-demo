import type { GlobalUser } from "../model/GlobalUser.js";
import { defineGlobalUsers } from "../model/GlobalUser.js";
import type { Sequelize, Transaction } from "sequelize";

/**
 * Data Access Object for global users
 */
export interface GlobalUserDao {
	/**
	 * Find user by email
	 */
	findUserByEmail(email: string): Promise<GlobalUser | undefined>;

	/**
	 * Find user by ID
	 */
	findUserById(id: number): Promise<GlobalUser | undefined>;

	/**
	 * Create a new user
	 */
	createUser(
		data: { email: string; name: string; isActive?: boolean },
		transaction?: Transaction,
	): Promise<GlobalUser>;

	/**
	 * Update user information
	 */
	updateUser(id: number, updates: Partial<Pick<GlobalUser, "name" | "isActive">>): Promise<void>;

	/**
	 * Delete user by ID
	 */
	deleteUser(id: number): Promise<void>;

	/**
	 * Update user email (used in GitHub OAuth email selection Scenario 1)
	 */
	updateUserEmail(id: number, email: string): Promise<void>;
}

/**
 * Create a GlobalUserDao instance
 */
export function createGlobalUserDao(sequelize: Sequelize): GlobalUserDao {
	const GlobalUsers = defineGlobalUsers(sequelize);

	return {
		findUserByEmail,
		findUserById,
		createUser,
		updateUser,
		deleteUser,
		updateUserEmail,
	};

	async function findUserByEmail(email: string): Promise<GlobalUser | undefined> {
		// Normalize email to lowercase for case-insensitive lookup
		const result = await GlobalUsers.findOne({
			where: { email: email.toLowerCase() },
		});
		return result ? (result.get({ plain: true }) as GlobalUser) : undefined;
	}

	async function findUserById(id: number): Promise<GlobalUser | undefined> {
		const result = await GlobalUsers.findByPk(id);
		return result ? (result.get({ plain: true }) as GlobalUser) : undefined;
	}

	async function createUser(
		data: { email: string; name: string; isActive?: boolean },
		transaction?: Transaction,
	): Promise<GlobalUser> {
		// Normalize email to lowercase for consistent storage
		const result = await GlobalUsers.create(
			{
				email: data.email.toLowerCase(),
				name: data.name,
				isActive: data.isActive ?? false,
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize create() requires all fields including auto-generated ones
			} as any,
			{ transaction: transaction ?? null },
		);
		return result.get({ plain: true }) as GlobalUser;
	}

	async function updateUser(id: number, updates: Partial<Pick<GlobalUser, "name" | "isActive">>): Promise<void> {
		await GlobalUsers.update(updates, {
			where: { id },
		});
	}

	async function deleteUser(id: number): Promise<void> {
		await GlobalUsers.destroy({
			where: { id },
		});
	}

	async function updateUserEmail(id: number, email: string): Promise<void> {
		await GlobalUsers.update({ email: email.toLowerCase(), updatedAt: new Date() }, { where: { id } });
	}
}
