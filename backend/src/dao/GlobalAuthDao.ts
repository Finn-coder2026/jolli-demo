import type { GlobalAuth } from "../model/GlobalAuth.js";
import { defineGlobalAuths } from "../model/GlobalAuth.js";
import type { Sequelize, Transaction } from "sequelize";
import { QueryTypes } from "sequelize";

/**
 * Data Access Object for global authentication
 */
export interface GlobalAuthDao {
	/**
	 * Find auth record by user ID and provider
	 */
	findAuthByUserIdAndProvider(userId: number, provider: string): Promise<GlobalAuth | undefined>;

	/**
	 * Find auth record by provider and provider ID (for OAuth)
	 */
	findAuthByProviderAndProviderId(provider: string, providerId: string): Promise<GlobalAuth | undefined>;

	/**
	 * Create a new auth record
	 */
	createAuth(
		data: {
			userId: number;
			provider: string;
			providerId?: string;
			providerEmail?: string;
			passwordHash?: string;
			passwordSalt?: string;
			passwordAlgo?: string;
			passwordIterations?: number;
			accessToken?: string;
			refreshToken?: string;
			tokenExpiresAt?: Date;
		},
		transaction?: Transaction,
	): Promise<GlobalAuth>;

	/**
	 * Update auth record
	 */
	updateAuth(
		id: number,
		updates: Partial<
			Pick<GlobalAuth, "accessToken" | "refreshToken" | "tokenExpiresAt" | "passwordHash" | "passwordSalt">
		>,
		transaction?: Transaction,
	): Promise<void>;

	/**
	 * Delete auth record
	 */
	deleteAuth(id: number): Promise<void>;

	/**
	 * Get all auth records for a user
	 */
	findAuthsByUserId(userId: number): Promise<Array<GlobalAuth>>;

	/**
	 * Get all authentication providers for a user
	 * Returns array of provider names like ["credential"], ["google"], or ["credential", "google"]
	 */
	getUserAuthProviders(userId: number): Promise<Array<string>>;

	/**
	 * Check if user has password-based authentication
	 * Returns true if user has "credential" or "password" provider
	 */
	hasPasswordAuth(userId: number): Promise<boolean>;

	/**
	 * Find GitHub auth by user ID with creation time
	 * Used to check if GitHub auth is new (first-time login check)
	 */
	findGitHubAuthByUserId(userId: number): Promise<GlobalAuthInfo | undefined>;

	/**
	 * Find auth by provider and provider ID, with user info and auth count
	 * Used to find existing GitHub auth record by GitHub user ID
	 */
	findAuthWithUserByProviderId(provider: string, providerId: string): Promise<GlobalAuthWithUser | undefined>;

	/**
	 * Count auth methods for a user
	 * Used to determine Scenario 1 vs Scenario 2 in email selection
	 */
	countAuthsByUserId(userId: number): Promise<number>;

	/**
	 * Update tokens for an auth record
	 */
	updateTokens(userId: number, provider: string, accessToken: string, refreshToken: string | null): Promise<void>;

	/**
	 * Update tokens for an auth record by provider + providerId.
	 * Safer for OAuth accounts because providerId uniquely identifies a third-party identity.
	 */
	updateTokensByProviderId(
		provider: string,
		providerId: string,
		accessToken: string,
		refreshToken: string | null,
	): Promise<void>;

	/**
	 * Reassign an OAuth auth record to a different user by provider identity.
	 * Used when GitHub email selection chooses an existing user account.
	 */
	reassignAuthByProviderId(provider: string, providerId: string, targetUserId: number): Promise<void>;

	/**
	 * Delete auth by user ID and provider
	 * Used in Scenario 2b when creating new account
	 */
	deleteAuthByUserIdAndProvider(userId: number, provider: string): Promise<void>;
}

/**
 * GitHub auth info with creation time (for new user detection)
 */
export interface GlobalAuthInfo {
	accountId: string; // provider_id
	accessToken: string;
	refreshToken: string | null;
	createdAt: Date;
}

/**
 * Auth record with user info and auth count
 */
export interface GlobalAuthWithUser {
	userId: number;
	userEmail: string;
	userName: string;
	isActive: boolean;
	authCount: number;
}

/**
 * Create a GlobalAuthDao instance
 */
export function createGlobalAuthDao(sequelize: Sequelize): GlobalAuthDao {
	const GlobalAuths = defineGlobalAuths(sequelize);

	return {
		findAuthByUserIdAndProvider,
		findAuthByProviderAndProviderId,
		createAuth,
		updateAuth,
		deleteAuth,
		findAuthsByUserId,
		getUserAuthProviders,
		hasPasswordAuth,
		findGitHubAuthByUserId,
		findAuthWithUserByProviderId,
		countAuthsByUserId,
		updateTokens,
		updateTokensByProviderId,
		reassignAuthByProviderId,
		deleteAuthByUserIdAndProvider,
	};

	async function findAuthByUserIdAndProvider(userId: number, provider: string): Promise<GlobalAuth | undefined> {
		const result = await GlobalAuths.findOne({
			where: { userId, provider },
		});
		return result ? (result.get({ plain: true }) as GlobalAuth) : undefined;
	}

	async function findAuthByProviderAndProviderId(
		provider: string,
		providerId: string,
	): Promise<GlobalAuth | undefined> {
		const result = await GlobalAuths.findOne({
			where: { provider, providerId },
		});
		return result ? (result.get({ plain: true }) as GlobalAuth) : undefined;
	}

	async function createAuth(
		data: {
			userId: number;
			provider: string;
			providerId?: string;
			providerEmail?: string;
			passwordHash?: string;
			passwordSalt?: string;
			passwordAlgo?: string;
			passwordIterations?: number;
			accessToken?: string;
			refreshToken?: string;
			tokenExpiresAt?: Date;
		},
		transaction?: Transaction,
	): Promise<GlobalAuth> {
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize create() requires all fields including auto-generated ones
		const result = await GlobalAuths.create(data as any, { transaction: transaction ?? null });
		return result.get({ plain: true }) as GlobalAuth;
	}

	async function updateAuth(
		id: number,
		updates: Partial<
			Pick<GlobalAuth, "accessToken" | "refreshToken" | "tokenExpiresAt" | "passwordHash" | "passwordSalt">
		>,
		transaction?: Transaction,
	): Promise<void> {
		await GlobalAuths.update(updates, {
			where: { id },
			transaction: transaction ?? null,
		});
	}

	async function deleteAuth(id: number): Promise<void> {
		await GlobalAuths.destroy({
			where: { id },
		});
	}

	async function findAuthsByUserId(userId: number): Promise<Array<GlobalAuth>> {
		const results = await GlobalAuths.findAll({
			where: { userId },
		});
		return results.map(r => r.get({ plain: true }) as GlobalAuth);
	}

	async function getUserAuthProviders(userId: number): Promise<Array<string>> {
		const auths = await findAuthsByUserId(userId);
		return auths.map(auth => auth.provider);
	}

	async function hasPasswordAuth(userId: number): Promise<boolean> {
		const providers = await getUserAuthProviders(userId);
		return providers.includes("credential") || providers.includes("password");
	}

	async function findGitHubAuthByUserId(userId: number): Promise<GlobalAuthInfo | undefined> {
		const result = await GlobalAuths.findOne({
			where: { userId, provider: "github" },
			attributes: ["providerId", "accessToken", "refreshToken", "createdAt"],
		});

		return result
			? {
					accountId: result.get("providerId") as string,
					accessToken: result.get("accessToken") as string,
					refreshToken: (result.get("refreshToken") as string) || null,
					createdAt: result.get("createdAt") as Date,
				}
			: undefined;
	}

	async function findAuthWithUserByProviderId(
		provider: string,
		providerId: string,
	): Promise<GlobalAuthWithUser | undefined> {
		const results = await sequelize.query<GlobalAuthWithUser>(
			`SELECT a.user_id as "userId", u.email as "userEmail", u.name as "userName", u.is_active as "isActive",
			        (SELECT COUNT(*) FROM global_auths WHERE user_id = a.user_id) as "authCount"
			 FROM global_auths a
			 JOIN global_users u ON a.user_id = u.id
			 WHERE a.provider = $1 AND a.provider_id = $2`,
			{ bind: [provider, providerId], type: QueryTypes.SELECT },
		);

		return results && results.length > 0 ? results[0] : undefined;
	}

	async function countAuthsByUserId(userId: number): Promise<number> {
		const count = await GlobalAuths.count({ where: { userId } });
		return count;
	}

	async function updateTokens(
		userId: number,
		provider: string,
		accessToken: string,
		refreshToken: string | null,
	): Promise<void> {
		const updates: { accessToken: string; refreshToken?: string } = { accessToken };
		if (refreshToken) {
			updates.refreshToken = refreshToken;
		}
		await GlobalAuths.update(updates, { where: { userId, provider } });
	}

	async function updateTokensByProviderId(
		provider: string,
		providerId: string,
		accessToken: string,
		refreshToken: string | null,
	): Promise<void> {
		const updates: { accessToken: string; refreshToken?: string } = { accessToken };
		if (refreshToken) {
			updates.refreshToken = refreshToken;
		}
		await GlobalAuths.update(updates, { where: { provider, providerId } });
	}

	async function reassignAuthByProviderId(provider: string, providerId: string, targetUserId: number): Promise<void> {
		await GlobalAuths.update(
			{
				userId: targetUserId,
				updatedAt: new Date(),
			},
			{
				where: { provider, providerId },
			},
		);
	}

	async function deleteAuthByUserIdAndProvider(userId: number, provider: string): Promise<void> {
		await GlobalAuths.destroy({ where: { userId, provider } });
	}
}
