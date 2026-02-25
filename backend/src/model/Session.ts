import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Session interface for better-auth sessions
 * Stores user session data in database
 */
export interface Session {
	readonly id: string; // Session ID (UUID)
	readonly userId: number; // FK to global_users.id
	readonly expiresAt: Date; // Session expiration time
	readonly token: string; // Session token
	readonly ipAddress?: string; // Client IP address
	readonly userAgent?: string; // Client user agent
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Define Session model for better-auth
 * Table name: session (singular, matching better-auth default)
 * Field names: camelCase (matching better-auth default)
 */
export function defineSessions(sequelize: Sequelize): ModelDef<Session> {
	const existing = sequelize.models?.Session;
	if (existing) {
		return existing as ModelDef<Session>;
	}
	return sequelize.define("Session", schema(sequelize), {
		tableName: "sessions",
		timestamps: true,
		underscored: false, // Use camelCase field names to match better-auth
	});
}

// Schema is a function because it needs access to sequelize.fn for defaultValue
function schema(sequelize: Sequelize) {
	return {
		id: {
			type: DataTypes.TEXT,
			primaryKey: true,
			allowNull: false,
			defaultValue: sequelize.fn("gen_random_uuid"),
		},
		userId: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		expiresAt: {
			type: DataTypes.DATE,
			allowNull: false,
		},
		token: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		ipAddress: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		userAgent: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		createdAt: {
			type: DataTypes.DATE,
			allowNull: true,
			defaultValue: DataTypes.NOW,
		},
		updatedAt: {
			type: DataTypes.DATE,
			allowNull: true,
			defaultValue: DataTypes.NOW,
		},
	};
}
