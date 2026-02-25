import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Global user stored in Manager DB.
 * This represents users who can access tenant applications.
 */
export interface GlobalUserRow {
	readonly id: number;
	readonly email: string;
	readonly name: string;
	readonly isActive: boolean;
	readonly image: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing global user type */
export interface GlobalUser {
	id: number;
	email: string;
	name: string;
	isActive: boolean;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new global user */
export interface NewGlobalUser {
	email: string;
	name: string;
	isActive?: boolean;
	image?: string | null;
}

export function defineGlobalUsers(sequelize: Sequelize): ModelDef<GlobalUserRow> {
	const existing = sequelize.models?.GlobalUser;
	if (existing) {
		return existing as ModelDef<GlobalUserRow>;
	}
	return sequelize.define("GlobalUser", schema, {
		timestamps: true,
		underscored: true,
		tableName: "global_users",
		indexes: [
			{
				fields: ["email"],
				name: "global_users_email_key",
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

/** Convert database row to API type */
export function toGlobalUser(row: GlobalUserRow): GlobalUser {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		isActive: row.isActive,
		image: row.image,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
