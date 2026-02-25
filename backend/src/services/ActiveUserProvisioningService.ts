import type { ActiveUserDao } from "../dao/ActiveUserDao.js";
import type { SpaceDao } from "../dao/SpaceDao.js";
import type { NewActiveUser } from "../model/ActiveUser.js";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager.js";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient.js";
import { getLog } from "../util/Logger.js";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

const log = getLog(import.meta);

export interface ActiveUserProvisioningServiceDeps {
	registryClient: TenantRegistryClient;
	connectionManager: TenantOrgConnectionManager;
}

/** Result of resolving tenant-scoped DAOs */
interface TenantDaoResult {
	activeUserDao: ActiveUserDao;
	spaceDao: SpaceDao;
	schemaName: string;
}

/**
 * Check whether the active_users table exists in the given schema.
 */
async function activeUsersTableExists(sequelize: Sequelize, schemaName: string): Promise<boolean> {
	const result = await sequelize.query<{ table_exists: boolean }>(
		`SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = $1
			AND table_name = 'active_users'
		) as table_exists`,
		{
			bind: [schemaName],
			type: QueryTypes.SELECT,
		},
	);
	return result.length > 0 && result[0]?.table_exists === true;
}

/**
 * Service for provisioning active_users records when users access tenants.
 * Ensures that users who have user_orgs relationships also have corresponding
 * active_users records in the tenant's schema.
 */
export class ActiveUserProvisioningService {
	constructor(private readonly deps: ActiveUserProvisioningServiceDeps) {}

	/**
	 * Resolve tenant + org to scoped DAOs.
	 * Returns null if tenant/org not found or active_users table doesn't exist.
	 */
	private async resolveTenantDaos(tenantId: string, orgId: string): Promise<TenantDaoResult | null> {
		const tenant = await this.deps.registryClient.getTenant(tenantId);
		const org = await this.deps.registryClient.getOrg(orgId);

		if (!tenant || !org) {
			return null;
		}

		const database = await this.deps.connectionManager.getConnection(tenant, org);

		if (!(await activeUsersTableExists(database.sequelize, org.schemaName))) {
			log.info({ tenantId, orgId, schemaName: org.schemaName }, "active_users table does not exist, skipping");
			return null;
		}

		return { activeUserDao: database.activeUserDao, spaceDao: database.spaceDao, schemaName: org.schemaName };
	}

	/**
	 * Check if a user exists in the tenant's active_users table and is inactive.
	 * Returns true only if the user record exists AND isActive is false.
	 * Returns false if the user doesn't exist yet (they will be provisioned as active).
	 */
	async isUserInactiveInTenant(userId: number, tenantId: string, orgId: string): Promise<boolean> {
		try {
			const resolved = await this.resolveTenantDaos(tenantId, orgId);
			if (!resolved) {
				return false;
			}

			const existingUser = await resolved.activeUserDao.findById(userId);
			return !!existingUser && !existingUser.isActive;
		} catch (error) {
			log.error({ error, userId, tenantId, orgId }, "Failed to check user active status in tenant");
			return false;
		}
	}

	/**
	 * Ensure a personal space exists for the user.
	 * Non-critical — failures are logged but do not propagate.
	 */
	private async ensurePersonalSpace(spaceDao: SpaceDao, userId: number): Promise<void> {
		try {
			await spaceDao.createPersonalSpaceIfNeeded(userId);
		} catch (error) {
			log.error({ error, userId }, "Failed to create personal space for user");
		}
	}

	/**
	 * Ensure user has an active_users record and personal space in the specified tenant/org.
	 * Creates the record if it doesn't exist, and ensures a personal space is available.
	 *
	 * @param params - User and tenant information
	 * @returns true if user was provisioned, false if skipped or failed
	 */
	async ensureActiveUser(params: {
		userId: number;
		email: string;
		name: string | null;
		picture: string | null;
		tenantId: string;
		orgId: string;
		role: string;
	}): Promise<boolean> {
		const { userId, email, name, picture, tenantId, orgId, role } = params;

		try {
			const resolved = await this.resolveTenantDaos(tenantId, orgId);
			if (!resolved) {
				if (
					!(await this.deps.registryClient.getTenant(tenantId)) ||
					!(await this.deps.registryClient.getOrg(orgId))
				) {
					log.error({ tenantId, orgId }, "Tenant or org not found in registry");
					throw new Error("Tenant or org not found");
				}
				return false;
			}

			// Check if user already exists in active_users
			const existingUser = await resolved.activeUserDao.findById(userId);

			if (existingUser) {
				// active_users is the source of truth for roles; do not overwrite
				// from user_orgs. Roles are managed explicitly via invitation acceptance
				// and admin role-change endpoints.
				await this.ensurePersonalSpace(resolved.spaceDao, userId);
				return false;
			}

			// Create active_users record
			const newActiveUser: NewActiveUser = {
				id: userId,
				email,
				name: name || null,
				image: picture || null,
				role: (role as "owner" | "admin" | "member") || "member",
				roleId: null,
				isActive: true,
				language: "en",
				timezone: "UTC",
				location: null,
				jobTitle: null,
				phone: null,
			};

			await resolved.activeUserDao.create(newActiveUser);

			log.info(
				{
					userId,
					tenantId,
					orgId,
					role: newActiveUser.role,
				},
				"Created active_users record for user",
			);

			await this.ensurePersonalSpace(resolved.spaceDao, userId);

			return true;
		} catch (error) {
			log.error({ error, userId, tenantId, orgId }, "Failed to provision active_users record");
			throw error;
		}
	}
}
