import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Session record for better-auth sessions.
 * Stored in Manager DB.
 */
export interface SessionRow {
	readonly id: string;
	readonly userId: string;
	readonly expiresAt: Date;
	readonly token: string;
	readonly ipAddress: string | null;
	readonly userAgent: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing session type */
export interface Session {
	id: string;
	userId: string;
	expiresAt: Date;
	token: string;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new session */
export interface NewSession {
	userId: string;
	expiresAt: Date;
	token: string;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export function defineSessions(sequelize: Sequelize): ModelDef<SessionRow> {
	const existing = sequelize.models?.Session;
	if (existing) {
		return existing as ModelDef<SessionRow>;
	}
	return sequelize.define("Session", schema(sequelize), {
		timestamps: true,
		underscored: false, // Use camelCase field names to match better-auth
		tableName: "sessions",
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

/** Convert database row to API type */
export function toSession(row: SessionRow): Session {
	return {
		id: row.id,
		userId: row.userId,
		expiresAt: row.expiresAt,
		token: row.token,
		ipAddress: row.ipAddress,
		userAgent: row.userAgent,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
