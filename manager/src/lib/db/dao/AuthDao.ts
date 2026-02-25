import type { Auth, AuthRow, NewAuth, OAuthProvider, UpdateAuthTokens } from "../models";
import { defineAuths, toAuth } from "../models";
import type { Sequelize } from "sequelize";

export interface AuthDao {
	findById(id: number): Promise<Auth | undefined>;
	findByUserId(userId: number): Promise<Array<Auth>>;
	findByProvider(provider: OAuthProvider, providerId: string): Promise<Auth | undefined>;
	create(auth: NewAuth): Promise<Auth>;
	updateTokens(id: number, tokens: UpdateAuthTokens): Promise<Auth | undefined>;
	delete(id: number): Promise<boolean>;
	deleteByUserId(userId: number): Promise<number>;
}

export function createAuthDao(sequelize: Sequelize): AuthDao {
	const Auths = defineAuths(sequelize);

	async function findById(id: number): Promise<Auth | undefined> {
		const row = await Auths.findByPk(id);
		if (!row) {
			return;
		}
		return toAuth(row.dataValues);
	}

	async function findByUserId(userId: number): Promise<Array<Auth>> {
		const rows = await Auths.findAll({
			where: { userId },
			order: [["createdAt", "DESC"]],
		});
		return rows.map(row => toAuth(row.dataValues));
	}

	async function findByProvider(provider: OAuthProvider, providerId: string): Promise<Auth | undefined> {
		const row = await Auths.findOne({
			where: { provider, providerId },
		});
		if (!row) {
			return;
		}
		return toAuth(row.dataValues);
	}

	async function create(auth: NewAuth): Promise<Auth> {
		const row = await Auths.create({
			userId: auth.userId,
			provider: auth.provider,
			providerId: auth.providerId,
			providerEmail: auth.providerEmail ?? null,
			accessToken: auth.accessToken ?? null,
			refreshToken: auth.refreshToken ?? null,
			tokenExpiresAt: auth.tokenExpiresAt ?? null,
		} as unknown as AuthRow);
		return toAuth(row.dataValues);
	}

	async function updateTokens(id: number, tokens: UpdateAuthTokens): Promise<Auth | undefined> {
		const row = await Auths.findByPk(id);
		if (!row) {
			return;
		}

		const updateData: Record<string, unknown> = {};
		if (tokens.accessToken !== undefined) {
			updateData.accessToken = tokens.accessToken;
		}
		if (tokens.refreshToken !== undefined) {
			updateData.refreshToken = tokens.refreshToken;
		}
		if (tokens.tokenExpiresAt !== undefined) {
			updateData.tokenExpiresAt = tokens.tokenExpiresAt;
		}

		await row.update(updateData);
		return toAuth(row.dataValues);
	}

	async function deleteAuth(id: number): Promise<boolean> {
		const deleted = await Auths.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteByUserId(userId: number): Promise<number> {
		const deleted = await Auths.destroy({ where: { userId } });
		return deleted;
	}

	return {
		findById,
		findByUserId,
		findByProvider,
		create,
		updateTokens,
		delete: deleteAuth,
		deleteByUserId,
	};
}
