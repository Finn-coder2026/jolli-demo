import type { DaoPostSyncHook, Database } from "../core/Database";
import {
	type ArchivedUser,
	defineArchivedUsers,
	type NewArchivedUser,
	postSyncArchivedUsers,
} from "../model/ArchivedUser";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import { Op, type Sequelize } from "sequelize";

export interface ArchivedUserDao {
	/** Find archived user record by ID */
	findById(id: number): Promise<ArchivedUser | undefined>;

	/** Find archived records by original user ID */
	findByUserId(userId: number): Promise<Array<ArchivedUser>>;

	/** List all archived users */
	listAll(options?: { limit?: number; offset?: number }): Promise<Array<ArchivedUser>>;

	/** List archived users removed by a specific user */
	listByRemover(removedBy: number): Promise<Array<ArchivedUser>>;

	/** List archived users within a date range */
	listByDateRange(startDate: Date, endDate: Date): Promise<Array<ArchivedUser>>;

	/** Create a new archived user record */
	create(archived: NewArchivedUser): Promise<ArchivedUser>;

	/** Delete archived record (permanent) */
	delete(id: number): Promise<boolean>;

	/** Delete old archived records */
	deleteOlderThan(days: number): Promise<number>;

	/** Count total archived users */
	count(): Promise<number>;
}

export function createArchivedUserDao(sequelize: Sequelize): ArchivedUserDao & DaoPostSyncHook {
	const ArchivedUserModel = defineArchivedUsers(sequelize);

	return {
		postSync,
		findById,
		findByUserId,
		listAll,
		listByRemover,
		listByDateRange,
		create,
		delete: deleteArchived,
		deleteOlderThan,
		count,
	};

	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		await postSyncArchivedUsers(sequelize);
	}

	async function findById(id: number): Promise<ArchivedUser | undefined> {
		const sql = `
			SELECT
				au.id, au.user_id, au.email, au.name, au.role,
				au.removed_by, u.name AS removed_by_name, au.reason, au.removed_at
			FROM archived_users au
			LEFT JOIN active_users u ON au.removed_by = u.id
			WHERE au.id = ?
		`;
		const [rows] = await sequelize.query(sql, { replacements: [id] });
		const rowArray = rows as Array<Record<string, unknown>>;
		if (rowArray.length === 0) {
			return;
		}
		const row = rowArray[0];
		return {
			id: row.id as number,
			userId: row.user_id as number,
			email: row.email as string,
			name: row.name as string | null,
			role: row.role as ArchivedUser["role"],
			removedBy: row.removed_by as number,
			removedByName: row.removed_by_name as string | null,
			reason: row.reason as string | null,
			removedAt: new Date(row.removed_at as string),
		};
	}

	async function findByUserId(userId: number): Promise<Array<ArchivedUser>> {
		const sql = `
			SELECT
				au.id, au.user_id, au.email, au.name, au.role,
				au.removed_by, u.name AS removed_by_name, au.reason, au.removed_at
			FROM archived_users au
			LEFT JOIN active_users u ON au.removed_by = u.id
			WHERE au.user_id = ?
			ORDER BY au.removed_at DESC
		`;
		const [rows] = await sequelize.query(sql, { replacements: [userId] });
		return (rows as Array<Record<string, unknown>>).map(row => ({
			id: row.id as number,
			userId: row.user_id as number,
			email: row.email as string,
			name: row.name as string | null,
			role: row.role as ArchivedUser["role"],
			removedBy: row.removed_by as number,
			removedByName: row.removed_by_name as string | null,
			reason: row.reason as string | null,
			removedAt: new Date(row.removed_at as string),
		}));
	}

	async function listAll(options?: { limit?: number; offset?: number }): Promise<Array<ArchivedUser>> {
		// Use raw SQL to join with active_users for remover name
		let sql = `
			SELECT
				au.id, au.user_id, au.email, au.name, au.role,
				au.removed_by, u.name AS removed_by_name, au.reason, au.removed_at
			FROM archived_users au
			LEFT JOIN active_users u ON au.removed_by = u.id
			ORDER BY au.removed_at ASC
		`;
		const replacements: Array<number> = [];
		if (options?.limit !== undefined) {
			sql += " LIMIT ?";
			replacements.push(options.limit);
		}
		if (options?.offset !== undefined) {
			sql += " OFFSET ?";
			replacements.push(options.offset);
		}
		const [rows] = await sequelize.query(sql, { replacements });
		return (rows as Array<Record<string, unknown>>).map(row => ({
			id: row.id as number,
			userId: row.user_id as number,
			email: row.email as string,
			name: row.name as string | null,
			role: row.role as ArchivedUser["role"],
			removedBy: row.removed_by as number,
			removedByName: row.removed_by_name as string | null,
			reason: row.reason as string | null,
			removedAt: new Date(row.removed_at as string),
		}));
	}

	async function listByRemover(removedBy: number): Promise<Array<ArchivedUser>> {
		const sql = `
			SELECT
				au.id, au.user_id, au.email, au.name, au.role,
				au.removed_by, u.name AS removed_by_name, au.reason, au.removed_at
			FROM archived_users au
			LEFT JOIN active_users u ON au.removed_by = u.id
			WHERE au.removed_by = ?
			ORDER BY au.removed_at DESC
		`;
		const [rows] = await sequelize.query(sql, { replacements: [removedBy] });
		return (rows as Array<Record<string, unknown>>).map(row => ({
			id: row.id as number,
			userId: row.user_id as number,
			email: row.email as string,
			name: row.name as string | null,
			role: row.role as ArchivedUser["role"],
			removedBy: row.removed_by as number,
			removedByName: row.removed_by_name as string | null,
			reason: row.reason as string | null,
			removedAt: new Date(row.removed_at as string),
		}));
	}

	async function listByDateRange(startDate: Date, endDate: Date): Promise<Array<ArchivedUser>> {
		const sql = `
			SELECT
				au.id, au.user_id, au.email, au.name, au.role,
				au.removed_by, u.name AS removed_by_name, au.reason, au.removed_at
			FROM archived_users au
			LEFT JOIN active_users u ON au.removed_by = u.id
			WHERE au.removed_at >= ? AND au.removed_at <= ?
			ORDER BY au.removed_at DESC
		`;
		const [rows] = await sequelize.query(sql, { replacements: [startDate, endDate] });
		return (rows as Array<Record<string, unknown>>).map(row => ({
			id: row.id as number,
			userId: row.user_id as number,
			email: row.email as string,
			name: row.name as string | null,
			role: row.role as ArchivedUser["role"],
			removedBy: row.removed_by as number,
			removedByName: row.removed_by_name as string | null,
			reason: row.reason as string | null,
			removedAt: new Date(row.removed_at as string),
		}));
	}

	async function create(archived: NewArchivedUser): Promise<ArchivedUser> {
		const created = await ArchivedUserModel.create(archived as ArchivedUser);
		const createdId = created.get("id") as number;
		// Fetch with join to include removedByName
		const result = await findById(createdId);
		// Result should always exist since we just created it
		if (!result) {
			throw new Error(`Failed to fetch newly created archived user with id ${createdId}`);
		}
		return result;
	}

	async function deleteArchived(id: number): Promise<boolean> {
		const count = await ArchivedUserModel.destroy({ where: { id } });
		return count > 0;
	}

	async function deleteOlderThan(days: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		return await ArchivedUserModel.destroy({
			where: {
				removedAt: { [Op.lt]: cutoffDate },
			},
		});
	}

	async function count(): Promise<number> {
		return await ArchivedUserModel.count();
	}
}

export function createArchivedUserDaoProvider(defaultDao: ArchivedUserDao): DaoProvider<ArchivedUserDao> {
	return {
		getDao(context: TenantOrgContext | undefined): ArchivedUserDao {
			return context?.database.archivedUserDao ?? defaultDao;
		},
	};
}
