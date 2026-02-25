import type { GlobalUser, GlobalUserRow, NewGlobalUser } from "../models";
import { defineGlobalUsers, toGlobalUser } from "../models";
import type { Sequelize } from "sequelize";

export interface GlobalUserDao {
	findById(id: number): Promise<GlobalUser | undefined>;
	findByEmail(email: string): Promise<GlobalUser | undefined>;
	create(user: NewGlobalUser): Promise<GlobalUser>;
	findOrCreate(user: NewGlobalUser): Promise<GlobalUser>;
}

export function createGlobalUserDao(sequelize: Sequelize): GlobalUserDao {
	const GlobalUsers = defineGlobalUsers(sequelize);

	async function findById(id: number): Promise<GlobalUser | undefined> {
		const row = await GlobalUsers.findByPk(id);
		if (!row) {
			return;
		}
		return toGlobalUser(row.dataValues);
	}

	async function findByEmail(email: string): Promise<GlobalUser | undefined> {
		// Normalize email to lowercase for case-insensitive lookup
		const row = await GlobalUsers.findOne({ where: { email: email.toLowerCase() } });
		if (!row) {
			return;
		}
		return toGlobalUser(row.dataValues);
	}

	async function create(user: NewGlobalUser): Promise<GlobalUser> {
		// Normalize email to lowercase for consistent storage
		const row = await GlobalUsers.create({
			email: user.email.toLowerCase(),
			name: user.name,
			isActive: user.isActive ?? false,
			image: user.image ?? null,
		} as unknown as GlobalUserRow);
		return toGlobalUser(row.dataValues);
	}

	/**
	 * Find an existing user by email, or create a new one if not found.
	 */
	async function findOrCreate(user: NewGlobalUser): Promise<GlobalUser> {
		const existing = await findByEmail(user.email);
		if (existing) {
			return existing;
		}
		return create(user);
	}

	return {
		findById,
		findByEmail,
		create,
		findOrCreate,
	};
}
