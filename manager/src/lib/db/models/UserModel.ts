import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** User roles for Manager App */
export type UserRole = "super_admin" | "user";

/** Internal model interface matching database schema */
export interface UserRow {
	readonly id: number;
	readonly email: string;
	readonly name: string | null;
	readonly picture: string | null;
	readonly role: UserRole;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing user type */
export interface User {
	id: number;
	email: string;
	name: string | null;
	picture: string | null;
	role: UserRole;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new user */
export interface NewUser {
	email: string;
	name?: string | null;
	picture?: string | null;
	role?: UserRole;
	isActive?: boolean;
}

/** Input type for updating a user */
export interface UpdateUser {
	name?: string | null;
	picture?: string | null;
	role?: UserRole;
	isActive?: boolean;
}

export function defineUsers(sequelize: Sequelize): ModelDef<UserRow> {
	return sequelize.define("user", schema, {
		timestamps: true,
		underscored: true,
		tableName: "users",
		indexes: [
			{
				fields: ["email"],
				name: "users_email_key",
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
		// unique: true removed - now defined in indexes above
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: true,
	},
	picture: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	role: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "user",
	},
	isActive: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: true,
		field: "is_active",
	},
};

/** Convert database row to API type */
export function toUser(row: UserRow): User {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		picture: row.picture,
		role: row.role,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
