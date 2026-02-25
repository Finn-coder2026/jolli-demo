import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	BUILT_IN_PERMISSIONS,
	DEFAULT_ROLE_PERMISSIONS,
	definePermissions,
	type Permission,
} from "../model/Permission";
import { BUILT_IN_ROLES, defineRoles, type NewRole, type Role, type UpdateRole } from "../model/Role";
import { defineRolePermissions } from "../model/RolePermission";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import { Op, QueryTypes, type Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Role with its assigned permissions.
 */
export interface RoleWithPermissions extends Role {
	permissions: Array<Permission>;
}

export interface RoleDao {
	/** List all roles */
	listAll(): Promise<Array<Role>>;

	/** Find role by ID */
	findById(id: number): Promise<Role | undefined>;

	/** Find role by slug */
	findBySlug(slug: string): Promise<Role | undefined>;

	/** Get role with permissions by ID */
	getRoleWithPermissions(id: number): Promise<RoleWithPermissions | undefined>;

	/** Get role with permissions by slug */
	getRoleWithPermissionsBySlug(slug: string): Promise<RoleWithPermissions | undefined>;

	/** Create a new custom role */
	create(role: NewRole): Promise<Role>;

	/** Update a custom role (fails for built-in roles) */
	update(id: number, updates: UpdateRole): Promise<Role | undefined>;

	/** Delete a custom role (fails for built-in roles) */
	delete(id: number): Promise<boolean>;

	/** Get permissions for a role */
	getPermissions(roleId: number): Promise<Array<Permission>>;

	/** Set permissions for a role (replaces existing, using permission slugs) */
	setPermissions(roleId: number, permissionSlugs: Array<string>): Promise<void>;

	/** Clone a role with new name/slug */
	cloneRole(sourceId: number, name: string, slug: string): Promise<Role>;

	/** Get the default role for new users */
	getDefaultRole(): Promise<Role | undefined>;
}

export function createRoleDao(sequelize: Sequelize): RoleDao & DaoPostSyncHook {
	const Roles = defineRoles(sequelize);
	const Permissions = definePermissions(sequelize);
	defineRolePermissions(sequelize);

	return {
		postSync,
		listAll,
		findById,
		findBySlug,
		getRoleWithPermissions,
		getRoleWithPermissionsBySlug,
		create,
		update,
		delete: deleteRole,
		getPermissions,
		setPermissions,
		cloneRole,
		getDefaultRole,
	};

	/** Post-sync hook to seed built-in roles, permissions, and their associations. */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		await seedBuiltInRoles();
		await seedAndCleanPermissions();
		await populateSlugColumns();
		await seedAndCleanRolePermissions();
	}

	/** Backfill slug columns for rows migrated from the integer-only schema. */
	async function populateSlugColumns(): Promise<void> {
		await sequelize.query(
			`UPDATE role_permissions rp SET role = r.slug
			 FROM roles r WHERE rp.role_id = r.id AND rp.role IS NULL`,
			{ type: QueryTypes.UPDATE },
		);
		await sequelize.query(
			`UPDATE role_permissions rp SET permission = p.slug
			 FROM permissions p WHERE rp.permission_id = p.id AND rp.permission IS NULL`,
			{ type: QueryTypes.UPDATE },
		);
	}

	/** Seed built-in roles (idempotent). */
	async function seedBuiltInRoles(): Promise<void> {
		for (const roleData of BUILT_IN_ROLES) {
			const existing = await Roles.findOne({ where: { slug: roleData.slug } });
			if (!existing) {
				log.info("Seeding built-in role: %s", roleData.slug);
				await Roles.create({ ...roleData, clonedFrom: null } as Role);
			}
		}
	}

	/** Seed built-in permissions and remove obsolete ones. */
	async function seedAndCleanPermissions(): Promise<void> {
		const validSlugs = BUILT_IN_PERMISSIONS.map(p => p.slug);

		// Seed new permissions
		for (const permData of BUILT_IN_PERMISSIONS) {
			const existing = await Permissions.findOne({ where: { slug: permData.slug } });
			if (!existing) {
				log.info("Seeding built-in permission: %s", permData.slug);
				await Permissions.create(permData as Permission);
			}
		}

		// Delete obsolete permissions (not in current BUILT_IN_PERMISSIONS)
		if (validSlugs.length > 0) {
			const deleted = await Permissions.destroy({
				where: { slug: { [Op.notIn]: validSlugs } },
			});
			if (deleted > 0) {
				log.info("Removed %d obsolete permissions", deleted);
			}
		}
	}

	/** Seed role-permission associations and remove obsolete ones. */
	async function seedAndCleanRolePermissions(): Promise<void> {
		// Seed missing associations for built-in roles
		for (const [roleSlug, permSlugs] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
			// Check which permissions are already assigned
			const existing = await sequelize.query<{ permission: string }>(
				"SELECT permission FROM role_permissions WHERE role = :roleSlug",
				{ replacements: { roleSlug }, type: QueryTypes.SELECT },
			);
			const existingPerms = new Set(existing.map(e => e.permission));

			let addedCount = 0;
			for (const permSlug of permSlugs) {
				if (!existingPerms.has(permSlug)) {
					await insertRolePermission(roleSlug, permSlug);
					addedCount++;
				}
			}

			if (addedCount > 0) {
				log.info("Synced %d missing permissions for role: %s", addedCount, roleSlug);
			}

			// Remove obsolete associations for this built-in role
			await sequelize.query(
				"DELETE FROM role_permissions WHERE role = :roleSlug AND permission NOT IN (:validPerms)",
				{ replacements: { roleSlug, validPerms: permSlugs }, type: QueryTypes.DELETE },
			);
		}

		// Remove associations for permissions that no longer exist
		const validSlugs = BUILT_IN_PERMISSIONS.map(p => p.slug);
		if (validSlugs.length > 0) {
			await sequelize.query("DELETE FROM role_permissions WHERE permission NOT IN (:validSlugs)", {
				replacements: { validSlugs },
				type: QueryTypes.DELETE,
			});
		}
	}

	/**
	 * Insert a role-permission association, resolving integer IDs from slugs via subquery.
	 * Populates all 4 columns (role_id, permission_id, role, permission) atomically.
	 */
	async function insertRolePermission(roleSlug: string, permSlug: string): Promise<void> {
		await sequelize.query(
			`INSERT INTO role_permissions (role_id, permission_id, role, permission, created_at)
			 SELECT r.id, p.id, r.slug, p.slug, NOW()
			 FROM roles r, permissions p
			 WHERE r.slug = :roleSlug AND p.slug = :permSlug
			 ON CONFLICT DO NOTHING`,
			{ replacements: { roleSlug, permSlug }, type: QueryTypes.INSERT },
		);
	}

	async function listAll(): Promise<Array<Role>> {
		const roles = await Roles.findAll({
			order: [
				["priority", "DESC"],
				["name", "ASC"],
			],
		});
		return roles.map(r => r.get({ plain: true }));
	}

	async function findById(id: number): Promise<Role | undefined> {
		const role = await Roles.findByPk(id);
		return role ? role.get({ plain: true }) : undefined;
	}

	async function findBySlug(slug: string): Promise<Role | undefined> {
		const role = await Roles.findOne({ where: { slug } });
		return role ? role.get({ plain: true }) : undefined;
	}

	async function getRoleWithPermissions(id: number): Promise<RoleWithPermissions | undefined> {
		const role = await findById(id);
		if (!role) {
			return;
		}
		const permissions = await getPermissions(id);
		return { ...role, permissions };
	}

	async function getRoleWithPermissionsBySlug(slug: string): Promise<RoleWithPermissions | undefined> {
		const role = await findBySlug(slug);
		if (!role) {
			return;
		}
		const permissions = await getPermissions(role.id);
		return { ...role, permissions };
	}

	async function create(role: NewRole): Promise<Role> {
		const created = await Roles.create(role as Role);
		return created.get({ plain: true });
	}

	async function update(id: number, updates: UpdateRole): Promise<Role | undefined> {
		const role = await findById(id);
		if (!role) {
			return;
		}
		if (role.isBuiltIn) {
			throw new Error("Cannot update built-in role");
		}
		const [count] = await Roles.update(updates, { where: { id } });
		if (count === 0) {
			return;
		}
		return findById(id);
	}

	async function deleteRole(id: number): Promise<boolean> {
		const role = await findById(id);
		if (!role) {
			return false;
		}
		if (role.isBuiltIn) {
			throw new Error("Cannot delete built-in role");
		}
		// Delete role-permission associations first (slug-based, no cascade)
		await sequelize.query("DELETE FROM role_permissions WHERE role = :roleSlug", {
			replacements: { roleSlug: role.slug },
			type: QueryTypes.DELETE,
		});
		const count = await Roles.destroy({ where: { id } });
		return count > 0;
	}

	/**
	 * Get permissions for a role by role ID.
	 * Looks up the role's slug, then joins via the slug-based role_permissions table.
	 */
	async function getPermissions(roleId: number): Promise<Array<Permission>> {
		const role = await findById(roleId);
		if (!role) {
			return [];
		}
		const results = await sequelize.query<Permission>(
			`SELECT p.* FROM permissions p
			 INNER JOIN role_permissions rp ON p.slug = rp.permission
			 WHERE rp.role = :roleSlug
			 ORDER BY p.category, p.name`,
			{
				replacements: { roleSlug: role.slug },
				type: QueryTypes.SELECT,
			},
		);
		return results.map(r => ({
			id: r.id,
			name: r.name,
			slug: r.slug,
			description: r.description,
			category: r.category,
			createdAt: r.createdAt,
		}));
	}

	/**
	 * Set permissions for a role using permission slugs.
	 * Replaces all existing permission associations.
	 *
	 * Validates all slugs exist before modifying, and runs within a
	 * transaction so a crash mid-update cannot leave partial state.
	 */
	async function setPermissions(roleId: number, permissionSlugs: Array<string>): Promise<void> {
		const role = await findById(roleId);
		if (!role) {
			throw new Error("Role not found");
		}
		if (role.isBuiltIn) {
			throw new Error("Cannot modify permissions for built-in role");
		}

		// Validate all slugs exist before touching any data
		const validSlugs = new Set(BUILT_IN_PERMISSIONS.map(p => p.slug));
		const invalidSlugs = permissionSlugs.filter(s => !validSlugs.has(s));
		if (invalidSlugs.length > 0) {
			throw new Error(`Invalid permission slugs: ${invalidSlugs.join(", ")}`);
		}

		// Wrap in transaction so a crash cannot leave partial permissions
		await sequelize.transaction(async t => {
			await sequelize.query("DELETE FROM role_permissions WHERE role = :roleSlug", {
				replacements: { roleSlug: role.slug },
				type: QueryTypes.DELETE,
				transaction: t,
			});

			for (const permSlug of permissionSlugs) {
				await sequelize.query(
					`INSERT INTO role_permissions (role_id, permission_id, role, permission, created_at)
					 SELECT r.id, p.id, r.slug, p.slug, NOW()
					 FROM roles r, permissions p
					 WHERE r.slug = :roleSlug AND p.slug = :permSlug
					 ON CONFLICT DO NOTHING`,
					{ replacements: { roleSlug: role.slug, permSlug }, type: QueryTypes.INSERT, transaction: t },
				);
			}
		});
	}

	async function cloneRole(sourceId: number, name: string, slug: string): Promise<Role> {
		const source = await findById(sourceId);
		if (!source) {
			throw new Error("Source role not found");
		}

		// Create new role based on source
		const newRole = await create({
			name,
			slug,
			description: source.description,
			isBuiltIn: false,
			isDefault: false,
			priority: source.priority,
			clonedFrom: sourceId,
		});

		// Copy permissions from source role via subquery
		const sourcePermissions = await getPermissions(sourceId);
		for (const perm of sourcePermissions) {
			await insertRolePermission(newRole.slug, perm.slug);
		}

		return newRole;
	}

	async function getDefaultRole(): Promise<Role | undefined> {
		const role = await Roles.findOne({ where: { isDefault: true } });
		return role ? role.get({ plain: true }) : undefined;
	}
}

export function createRoleDaoProvider(defaultDao: RoleDao): DaoProvider<RoleDao> {
	return {
		getDao(context: TenantOrgContext | undefined): RoleDao {
			return context?.database.roleDao ?? defaultDao;
		},
	};
}
