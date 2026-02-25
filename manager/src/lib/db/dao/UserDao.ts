import type { NewUser, UpdateUser, User, UserRole, UserRow } from "../models";
import { defineUsers, toUser } from "../models";
import type { Sequelize } from "sequelize";

export interface UserDao {
	findAll(): Promise<Array<User>>;
	findById(id: number): Promise<User | undefined>;
	findByEmail(email: string): Promise<User | undefined>;
	findByRole(role: UserRole): Promise<Array<User>>;
	create(user: NewUser): Promise<User>;
	update(id: number, updates: UpdateUser): Promise<User | undefined>;
	delete(id: number): Promise<boolean>;
	countByRole(role: UserRole): Promise<number>;
}

export function createUserDao(sequelize: Sequelize): UserDao {
	const Users = defineUsers(sequelize);

	async function findAll(): Promise<Array<User>> {
		const rows = await Users.findAll({
			order: [["createdAt", "DESC"]],
		});
		return rows.map(row => toUser(row.dataValues));
	}

	async function findById(id: number): Promise<User | undefined> {
		const row = await Users.findByPk(id);
		if (!row) {
			return;
		}
		return toUser(row.dataValues);
	}

	async function findByEmail(email: string): Promise<User | undefined> {
		// Normalize email to lowercase for case-insensitive lookup
		const row = await Users.findOne({ where: { email: email.toLowerCase() } });
		if (!row) {
			return;
		}
		return toUser(row.dataValues);
	}

	async function findByRole(role: UserRole): Promise<Array<User>> {
		const rows = await Users.findAll({
			where: { role },
			order: [["createdAt", "DESC"]],
		});
		return rows.map(row => toUser(row.dataValues));
	}

	async function create(user: NewUser): Promise<User> {
		// Normalize email to lowercase for consistent storage
		const row = await Users.create({
			email: user.email.toLowerCase(),
			name: user.name ?? null,
			picture: user.picture ?? null,
			role: user.role ?? "user",
			isActive: user.isActive ?? true,
		} as unknown as UserRow);
		return toUser(row.dataValues);
	}

	async function update(id: number, updates: UpdateUser): Promise<User | undefined> {
		const row = await Users.findByPk(id);
		if (!row) {
			return;
		}

		const updateData: Record<string, unknown> = {};
		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}
		if (updates.picture !== undefined) {
			updateData.picture = updates.picture;
		}
		if (updates.role !== undefined) {
			updateData.role = updates.role;
		}
		if (updates.isActive !== undefined) {
			updateData.isActive = updates.isActive;
		}

		await row.update(updateData);
		return toUser(row.dataValues);
	}

	async function deleteUser(id: number): Promise<boolean> {
		const deleted = await Users.destroy({ where: { id } });
		return deleted > 0;
	}

	async function countByRole(role: UserRole): Promise<number> {
		const count = await Users.count({ where: { role } });
		return count;
	}

	return {
		findAll,
		findById,
		findByEmail,
		findByRole,
		create,
		update,
		delete: deleteUser,
		countByRole,
	};
}
