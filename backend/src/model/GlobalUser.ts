import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Global user interface
 */
export interface GlobalUser {
	readonly id: number;
	readonly email: string;
	readonly name: string;
	readonly isActive: boolean;
	readonly image?: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Define GlobalUser model
 */
export function defineGlobalUsers(sequelize: Sequelize): ModelDef<GlobalUser> {
	const existing = sequelize.models?.GlobalUser;
	if (existing) {
		return existing as ModelDef<GlobalUser>;
	}
	return sequelize.define("GlobalUser", schema, {
		tableName: "global_users",
		timestamps: true,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "global_users_email_key",
		unique: true,
		fields: ["email"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	isActive: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_active",
	},
	image: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
};
