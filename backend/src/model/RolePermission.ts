import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Junction table linking roles to their permissions.
 *
 * Schema: (role_id, permission_id) integer FK composite PK with
 * denormalized (role, permission) slug columns + unique index for
 * fast slug-based lookups.
 */
export interface RolePermission {
	readonly roleId: number;
	readonly permissionId: number;
	readonly role: string;
	readonly permission: string;
	readonly createdAt: Date;
}

/**
 * Type for creating a new role-permission association.
 */
export type NewRolePermission = Omit<RolePermission, "createdAt">;

/**
 * Define the RolePermission model in Sequelize.
 */
export function defineRolePermissions(sequelize: Sequelize): ModelDef<RolePermission> {
	const existing = sequelize.models?.role_permission;
	if (existing) {
		return existing as ModelDef<RolePermission>;
	}
	return sequelize.define("role_permission", schema, {
		timestamps: true,
		updatedAt: false,
		underscored: true,
		tableName: "role_permissions",
		indexes: [
			{
				unique: true,
				fields: ["role", "permission"],
				name: "idx_role_permissions_slugs",
			},
		],
	});
}

/** Sequelize column definitions for role_permissions table. */
const schema = {
	roleId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		primaryKey: true,
		references: {
			model: "roles",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	permissionId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		primaryKey: true,
		references: {
			model: "permissions",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	role: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	permission: {
		type: DataTypes.STRING,
		allowNull: true,
	},
};
