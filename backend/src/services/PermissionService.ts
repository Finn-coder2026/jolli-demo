import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { RoleDao, RoleWithPermissions } from "../dao/RoleDao";
import { DEFAULT_ROLE_PERMISSIONS } from "../model/Permission";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";

const log = getLog(import.meta);

/**
 * User permissions data.
 */
interface UserPermissionsData {
	permissions: Array<string>;
	role: RoleWithPermissions | undefined;
}

/**
 * Service for checking user permissions at org level.
 */
export class PermissionService {
	private roleDaoProvider: DaoProvider<RoleDao>;
	private activeUserDaoProvider: DaoProvider<ActiveUserDao>;

	constructor(roleDaoProvider: DaoProvider<RoleDao>, activeUserDaoProvider: DaoProvider<ActiveUserDao>) {
		this.roleDaoProvider = roleDaoProvider;
		this.activeUserDaoProvider = activeUserDaoProvider;
	}

	/** Get tenant-aware RoleDao */
	private getRoleDao(): RoleDao {
		return this.roleDaoProvider.getDao(getTenantContext());
	}

	/** Get tenant-aware ActiveUserDao */
	private getActiveUserDao(): ActiveUserDao {
		return this.activeUserDaoProvider.getDao(getTenantContext());
	}

	/**
	 * Check if a user has a specific permission.
	 */
	async hasPermission(userId: number, permission: string): Promise<boolean> {
		const permissions = await this.getUserPermissions(userId);
		return permissions.includes(permission);
	}

	/**
	 * Check if a user has any of the specified permissions.
	 */
	async hasAnyPermission(userId: number, permissions: Array<string>): Promise<boolean> {
		const userPermissions = await this.getUserPermissions(userId);
		return permissions.some(p => userPermissions.includes(p));
	}

	/**
	 * Check if a user has all of the specified permissions.
	 */
	async hasAllPermissions(userId: number, permissions: Array<string>): Promise<boolean> {
		const userPermissions = await this.getUserPermissions(userId);
		return permissions.every(p => userPermissions.includes(p));
	}

	/**
	 * Get all permissions for a user.
	 * Resolves permissions from the role slug via the roles table.
	 */
	async getUserPermissions(userId: number): Promise<Array<string>> {
		const result = await this.loadUserPermissions(userId);
		return result.permissions;
	}

	/**
	 * Get user's role with permissions.
	 */
	async getUserRole(userId: number): Promise<RoleWithPermissions | undefined> {
		const result = await this.loadUserPermissions(userId);
		return result.role;
	}

	/**
	 * Load user permissions from database.
	 * Looks up the role by slug, falling back to DEFAULT_ROLE_PERMISSIONS
	 * if the slug hasn't been seeded in the roles table yet.
	 */
	private async loadUserPermissions(userId: number): Promise<UserPermissionsData> {
		const activeUserDao = this.getActiveUserDao();
		const user = await activeUserDao.findById(userId);
		if (!user) {
			log.warn("User %d not found, returning empty permissions", userId);
			return { permissions: [], role: undefined };
		}

		log.debug("Loading permissions for user %d (role: %s)", userId, user.role);

		// Look up role by slug (single source of truth)
		const roleDao = this.getRoleDao();
		const roleWithPerms = await roleDao.getRoleWithPermissionsBySlug(user.role);
		if (roleWithPerms) {
			log.debug("Loaded %d permissions for role '%s'", roleWithPerms.permissions.length, user.role);
			return {
				permissions: roleWithPerms.permissions.map((p: { slug: string }) => p.slug),
				role: roleWithPerms,
			};
		}

		// Fallback to default permission map (safety net for unseeded roles)
		const fallbackPermissions = DEFAULT_ROLE_PERMISSIONS[user.role] ?? [];
		log.debug("Using fallback permissions for role '%s': %d permissions", user.role, fallbackPermissions.length);
		return {
			permissions: [...fallbackPermissions],
			role: undefined,
		};
	}
}

/**
 * Factory function to create PermissionService with DAOs.
 */
export function createPermissionService(
	roleDaoProvider: DaoProvider<RoleDao>,
	activeUserDaoProvider: DaoProvider<ActiveUserDao>,
): PermissionService {
	return new PermissionService(roleDaoProvider, activeUserDaoProvider);
}
