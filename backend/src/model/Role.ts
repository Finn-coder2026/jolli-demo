import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Role definition for RBAC.
 */
export interface Role {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly description: string | null;
	readonly isBuiltIn: boolean;
	readonly isDefault: boolean;
	readonly priority: number;
	readonly clonedFrom: number | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Type for creating a new role.
 */
export type NewRole = Omit<Role, "id" | "createdAt" | "updatedAt">;

/**
 * Type for updating an existing role.
 */
export type UpdateRole = {
	name?: string;
	description?: string | null;
	isDefault?: boolean;
	priority?: number;
};

/**
 * Built-in roles that are seeded on startup.
 */
export const BUILT_IN_ROLES: Array<NewRole> = [
	{
		name: "Owner",
		slug: "owner",
		description: "Full access to all features and settings",
		isBuiltIn: true,
		isDefault: false,
		priority: 100,
		clonedFrom: null,
	},
	{
		name: "Admin",
		slug: "admin",
		description: "Administrative access with some restrictions",
		isBuiltIn: true,
		isDefault: false,
		priority: 80,
		clonedFrom: null,
	},
	{
		name: "Member",
		slug: "member",
		description: "Standard user access",
		isBuiltIn: true,
		isDefault: true,
		priority: 50,
		clonedFrom: null,
	},
];

/**
 * Define the Role model in Sequelize.
 */
export function defineRoles(sequelize: Sequelize): ModelDef<Role> {
	const existing = sequelize.models?.role;
	if (existing) {
		return existing as ModelDef<Role>;
	}
	return sequelize.define("role", schema, {
		timestamps: true,
		underscored: true,
		tableName: "roles",
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING(100),
		allowNull: false,
	},
	slug: {
		type: DataTypes.STRING(50),
		allowNull: false,
		unique: "roles_slug_key",
	},
	description: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	isBuiltIn: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	isDefault: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	priority: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
	},
	clonedFrom: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "roles",
			key: "id",
		},
		onDelete: "SET NULL",
	},
};
