import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * User-Organization relationship record (Manager DB).
 * Links a global user to a specific tenant and organization with a role.
 */
export interface UserOrgRow {
	readonly id: number;
	readonly userId: number;
	readonly tenantId: string;
	readonly orgId: string;
	readonly role: string | null;
	readonly isDefault: boolean;
	readonly lastAccessedAt: Date | null;
	readonly createdAt: Date;
}

/** API-facing user-org relationship type */
export interface UserOrg {
	id: number;
	userId: number;
	tenantId: string;
	orgId: string;
	role: string | null;
	isDefault: boolean;
	lastAccessedAt: Date | null;
	createdAt: Date;
}

/** Input type for creating a new user-org relationship */
export interface NewUserOrg {
	userId: number;
	tenantId: string;
	orgId: string;
	role?: string | null;
	isDefault?: boolean;
}

export function defineUserOrgs(sequelize: Sequelize): ModelDef<UserOrgRow> {
	const existing = sequelize.models?.UserOrg;
	if (existing) {
		return existing as ModelDef<UserOrgRow>;
	}
	return sequelize.define("UserOrg", schema, {
		timestamps: false,
		underscored: true,
		tableName: "user_orgs",
		indexes: [
			{
				fields: ["tenant_id", "org_id"],
				name: "idx_user_orgs_tenant_id",
			},
			{
				fields: ["user_id", "tenant_id", "org_id"],
				name: "user_orgs_user_id_tenant_id_org_id_key",
				unique: true,
			},
		],
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "user_id",
		references: {
			model: "global_users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	tenantId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "tenant_id",
	},
	orgId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "org_id",
	},
	role: {
		type: DataTypes.STRING(50), // Matches roles.slug length for custom role slugs
		allowNull: true,
	},
	isDefault: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_default",
	},
	lastAccessedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "last_accessed_at",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "created_at",
	},
};

/** Convert database row to API type */
export function toUserOrg(row: UserOrgRow): UserOrg {
	return {
		id: row.id,
		userId: row.userId,
		tenantId: row.tenantId,
		orgId: row.orgId,
		role: row.role,
		isDefault: row.isDefault,
		lastAccessedAt: row.lastAccessedAt,
		createdAt: row.createdAt,
	};
}
