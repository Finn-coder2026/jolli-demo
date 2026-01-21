import { type Auth, defineAuths, type NewAuth } from "../model/Auth";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

export interface AuthDao {
	findAuth(provider: string, subject: string): Promise<Auth | undefined>;
	createAuth(auth: NewAuth): Promise<Auth>;
	updateAuth(auth: Auth): Promise<Auth>;
}

export function createAuthDao(sequelize: Sequelize): AuthDao {
	const Auths = defineAuths(sequelize);

	return {
		findAuth,
		createAuth,
		updateAuth,
	};

	async function findAuth(provider: string, subject: string): Promise<Auth | undefined> {
		const auth = await Auths.findOne({ where: { provider, subject } });
		return auth ? auth.get({ plain: true }) : undefined;
	}

	async function createAuth(auth: Auth): Promise<Auth> {
		return (await Auths.create(auth)).get({ plain: true });
	}

	async function updateAuth(auth: Auth): Promise<Auth> {
		await Auths.update(auth, { where: { id: auth.id } });
		return auth;
	}
}

export function createAuthDaoProvider(defaultDao: AuthDao): DaoProvider<AuthDao> {
	return {
		getDao(context: TenantOrgContext | undefined): AuthDao {
			return context?.database.authDao ?? defaultDao;
		},
	};
}
