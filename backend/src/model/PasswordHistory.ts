import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Password history interface for storing historical passwords
 * Used to prevent password reuse and maintain security audit trail
 */
export interface PasswordHistory {
	readonly id: number;
	readonly userId: number; // Foreign key to global_users(id)
	readonly passwordHash: string; // Argon2id hash of the password
	readonly createdAt: Date;
}

/**
 * Define PasswordHistory model
 */
export function definePasswordHistory(sequelize: Sequelize): ModelDef<PasswordHistory> {
	const existing = sequelize.models?.PasswordHistory;
	if (existing) {
		return existing as ModelDef<PasswordHistory>;
	}
	return sequelize.define("PasswordHistory", schema, {
		tableName: "password_history",
		timestamps: false, // We only track createdAt, not updatedAt
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "idx_password_history_user_created",
		fields: ["user_id"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "user_id",
		comment: "Foreign key to global_users(id)",
		references: {
			model: "global_users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	passwordHash: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "password_hash",
		comment: "Argon2id hash of the password",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "created_at",
		defaultValue: DataTypes.NOW,
	},
};
