import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Types of actors that can trigger audit events
 */
export type AuditActorType = "user" | "system" | "api_key" | "webhook" | "scheduler" | "superadmin";

/**
 * Types of actions that can be audited
 */
export type AuditAction =
	// Authentication events
	| "login"
	| "logout"
	| "password_reset"
	// CRUD events
	| "create"
	| "update"
	| "delete"
	| "restore"
	// Resource-specific events
	| "move"
	| "reorder"
	| "publish"
	| "deploy"
	| "build"
	// Integration events
	| "connect"
	| "disconnect"
	| "sync"
	| "webhook_received"
	// User management events
	| "invite"
	| "accept"
	| "decline"
	| "activate"
	| "deactivate"
	| "role_change"
	| "member_add"
	| "member_remove"
	// Batch operations
	| "batch_import"
	| "batch_delete"
	| "batch_export";

/**
 * Types of resources that can be audited
 */
export type AuditResourceType =
	| "user"
	| "active_user"
	| "user_invitation"
	| "archived_user"
	| "site"
	| "space"
	| "folder"
	| "doc"
	| "integration"
	| "settings"
	| "tenant"
	| "org"
	| "session"
	| "role"
	| "role_permissions"
	| "image"
	| "owner_invitation";

/**
 * Represents a single field change in an audit event
 */
export interface AuditFieldChange {
	readonly field: string;
	readonly old: unknown;
	readonly new: unknown;
}

/**
 * Additional metadata for an audit event
 */
export interface AuditMetadata {
	readonly httpMethod?: string;
	readonly endpoint?: string;
	readonly requestId?: string;
	readonly userAgent?: string;
	readonly referer?: string;
	readonly [key: string]: unknown;
}

/**
 * Represents an audit event record
 */
export interface AuditEvent {
	readonly id: number;
	/** When the action occurred */
	readonly timestamp: Date;
	/** The user ID who performed the action (null for system/webhook actors) */
	readonly actorId: number | null;
	/** Type of actor that performed the action */
	readonly actorType: AuditActorType;
	/** Email of the actor for audit readability */
	readonly actorEmail: string | null;
	/** IP address of the actor */
	readonly actorIp: string | null;
	/** Device/user-agent of the actor */
	readonly actorDevice: string | null;
	/** The action that was performed */
	readonly action: AuditAction;
	/** Type of resource being acted upon */
	readonly resourceType: AuditResourceType;
	/** ID of the resource */
	readonly resourceId: string;
	/** Human-readable name of the resource */
	readonly resourceName: string | null;
	/** Array of field changes (for update actions) */
	readonly changes: Array<AuditFieldChange> | null;
	/** Additional metadata about the event */
	readonly metadata: AuditMetadata | null;
	/** SHA-256 hash for integrity verification */
	readonly eventHash: string | null;
	/** When the record was created */
	readonly createdAt: Date;
}

/**
 * Type for creating a new audit event (id, createdAt, and eventHash are generated)
 */
export type NewAuditEvent = Omit<AuditEvent, "id" | "createdAt" | "eventHash">;

/**
 * Define the AuditEvent model in Sequelize.
 *
 * Note: This table uses PostgreSQL range partitioning by timestamp, which requires
 * a composite primary key (id, timestamp). The partitioned table is created manually
 * in setupMonthlyPartitioning() in AuditEventDao.ts, not by Sequelize sync.
 */
export function defineAuditEvents(sequelize: Sequelize): ModelDef<AuditEvent> {
	const existing = sequelize.models?.audit_event;
	if (existing) {
		return existing as ModelDef<AuditEvent>;
	}
	return sequelize.define("audit_event", schema, { timestamps: true, updatedAt: false, underscored: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	timestamp: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
	},
	actorId: {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
	actorType: {
		type: DataTypes.STRING(32),
		allowNull: false,
	},
	actorEmail: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	actorIp: {
		type: DataTypes.TEXT, // IPv6 max length
		allowNull: true,
	},
	actorDevice: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	action: {
		type: DataTypes.STRING(64),
		allowNull: false,
	},
	resourceType: {
		type: DataTypes.STRING(64),
		allowNull: false,
	},
	resourceId: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	resourceName: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	changes: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	metadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	eventHash: {
		type: DataTypes.STRING(64),
		allowNull: true,
	},
};
