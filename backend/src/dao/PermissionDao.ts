import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	BUILT_IN_PERMISSIONS,
	definePermissions,
	PERMISSION_CATEGORIES,
	type Permission,
	type PermissionCategory,
} from "../model/Permission";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

export interface PermissionDao {
	/** List all permissions */
	listAll(): Promise<Array<Permission>>;

	/** Find permission by ID */
	findById(id: number): Promise<Permission | undefined>;

	/** Find permission by slug */
	findBySlug(slug: string): Promise<Permission | undefined>;

	/** List permissions by category */
	listByCategory(category: PermissionCategory): Promise<Array<Permission>>;

	/** Get all permission categories */
	getCategories(): ReadonlyArray<PermissionCategory>;

	/** List permissions grouped by category */
	listGroupedByCategory(): Promise<Record<PermissionCategory, Array<Permission>>>;
}

export function createPermissionDao(sequelize: Sequelize): PermissionDao & DaoPostSyncHook {
	const Permissions = definePermissions(sequelize);

	return {
		postSync,
		listAll,
		findById,
		findBySlug,
		listByCategory,
		getCategories,
		listGroupedByCategory,
	};

	/**
	 * Post-sync hook to seed built-in permissions.
	 * All operations are idempotent.
	 */
	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		// Seed built-in permissions (also done in RoleDao, but safe to run multiple times)
		for (const permData of BUILT_IN_PERMISSIONS) {
			const existing = await Permissions.findOne({ where: { slug: permData.slug } });
			if (!existing) {
				log.info("Seeding built-in permission: %s", permData.slug);
				await Permissions.create(permData as Permission);
			}
		}
	}

	async function listAll(): Promise<Array<Permission>> {
		const permissions = await Permissions.findAll({
			order: [
				["category", "ASC"],
				["name", "ASC"],
			],
		});
		return permissions.map(p => p.get({ plain: true }));
	}

	async function findById(id: number): Promise<Permission | undefined> {
		const permission = await Permissions.findByPk(id);
		return permission ? permission.get({ plain: true }) : undefined;
	}

	async function findBySlug(slug: string): Promise<Permission | undefined> {
		const permission = await Permissions.findOne({ where: { slug } });
		return permission ? permission.get({ plain: true }) : undefined;
	}

	async function listByCategory(category: PermissionCategory): Promise<Array<Permission>> {
		const permissions = await Permissions.findAll({
			where: { category },
			order: [["name", "ASC"]],
		});
		return permissions.map(p => p.get({ plain: true }));
	}

	function getCategories(): ReadonlyArray<PermissionCategory> {
		return PERMISSION_CATEGORIES;
	}

	async function listGroupedByCategory(): Promise<Record<PermissionCategory, Array<Permission>>> {
		const allPermissions = await listAll();
		const grouped = {} as Record<PermissionCategory, Array<Permission>>;

		for (const category of PERMISSION_CATEGORIES) {
			grouped[category] = allPermissions.filter(p => p.category === category);
		}

		return grouped;
	}
}

export function createPermissionDaoProvider(defaultDao: PermissionDao): DaoProvider<PermissionDao> {
	return {
		getDao(context: TenantOrgContext | undefined): PermissionDao {
			return context?.database.permissionDao ?? defaultDao;
		},
	};
}
