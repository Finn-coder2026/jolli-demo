import { defineUsers, type NewUser, type User } from "../model/User";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

export interface UserDao {
	findUser(email: string): Promise<User | undefined>;
	findUserById(id: number): Promise<User | undefined>;
	createUser(user: NewUser): Promise<User>;
	updateUser(user: User): Promise<User>;
	countUsers(): Promise<number>;
}

export function createUserDao(sequelize: Sequelize): UserDao {
	const Users = defineUsers(sequelize);

	return {
		findUser,
		findUserById,
		createUser,
		updateUser,
		countUsers,
	};

	async function findUser(email: string): Promise<User | undefined> {
		const user = await Users.findOne({ where: { email } });
		return user ? user.get({ plain: true }) : undefined;
	}

	async function findUserById(id: number): Promise<User | undefined> {
		const user = await Users.findOne({ where: { id } });
		return user ? user.get({ plain: true }) : undefined;
	}

	async function createUser(user: User): Promise<User> {
		return (await Users.create(user)).get({ plain: true });
	}

	async function updateUser(user: User): Promise<User> {
		await Users.update(user, { where: { id: user.id } });
		return user;
	}

	async function countUsers(): Promise<number> {
		return await Users.count();
	}
}

export function createUserDaoProvider(defaultDao: UserDao): DaoProvider<UserDao> {
	return {
		getDao(context: TenantOrgContext | undefined): UserDao {
			return context?.database.userDao ?? defaultDao;
		},
	};
}
