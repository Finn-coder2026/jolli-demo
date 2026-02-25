import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Password history record for storing historical passwords.
 * Used to prevent password reuse and maintain security audit trail.
 * Stored in Manager DB.
 */
export interface PasswordHistoryRow {
	readonly id: number;
	readonly userId: number;
	readonly passwordHash: string;
	readonly createdAt: Date;
}

/** API-facing password history type */
export interface PasswordHistory {
	id: number;
	userId: number;
	passwordHash: string;
	createdAt: Date;
}

/** Input type for creating a new password history record */
export interface NewPasswordHistory {
	userId: number;
	passwordHash: string;
}

export function definePasswordHistory(sequelize: Sequelize): ModelDef<PasswordHistoryRow> {
	const existing = sequelize.models?.PasswordHistory;
	if (existing) {
		return existing as ModelDef<PasswordHistoryRow>;
	}
	return sequelize.define("PasswordHistory", schema, {
		timestamps: false,
		underscored: true,
		tableName: "password_history",
		indexes: [
			{
				fields: ["user_id"],
				name: "idx_password_history_user_created",
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
	passwordHash: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "password_hash",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "created_at",
		defaultValue: DataTypes.NOW,
	},
};

/** Convert database row to API type */
export function toPasswordHistory(row: PasswordHistoryRow): PasswordHistory {
	return {
		id: row.id,
		userId: row.userId,
		passwordHash: row.passwordHash,
		createdAt: row.createdAt,
	};
}
