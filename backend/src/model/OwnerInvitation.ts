import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * OwnerInvitation interface for tracking pending owner invitations.
 * Stored in Manager DB (registry database).
 */
export interface OwnerInvitation {
	readonly id: number;
	readonly verificationId: number | null; // Reference to verifications.id (no FK constraint)
	readonly email: string;
	readonly name: string | null;
	readonly tenantId: string;
	readonly orgId: string;
	readonly invitedBy: number; // Manager DB users.id (SuperAdmin who sent invite)
	readonly previousOwnerId: number | null; // For owner change flow
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Input type for creating a new owner invitation
 */
export interface NewOwnerInvitation {
	email: string;
	name?: string | null;
	tenantId: string;
	orgId: string;
	invitedBy: number;
	previousOwnerId?: number | null;
}

/**
 * Define OwnerInvitation model
 */
export function defineOwnerInvitations(sequelize: Sequelize): ModelDef<OwnerInvitation> {
	const existing = sequelize.models?.OwnerInvitation;
	if (existing) {
		return existing as ModelDef<OwnerInvitation>;
	}
	return sequelize.define("OwnerInvitation", schema, {
		tableName: "owner_invitations",
		timestamps: true,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "idx_owner_invitations_verification_id",
		unique: true,
		fields: ["verification_id"],
	},
	{
		name: "idx_owner_invitations_tenant_org",
		fields: ["tenant_id", "org_id"],
	},
	{
		name: "idx_owner_invitations_email",
		fields: ["email"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	verificationId: {
		type: DataTypes.INTEGER,
		allowNull: true, // Starts as null, updated after verification record is created
		field: "verification_id",
		comment: "Reference to verifications.id (no FK constraint)",
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
		comment: "Invitee email address",
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: true,
		comment: "Invitee name (optional)",
	},
	tenantId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "tenant_id",
		comment: "Tenant ID",
	},
	orgId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "org_id",
		comment: "Organization ID",
	},
	invitedBy: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "invited_by",
		comment: "Manager DB users.id (SuperAdmin who sent invite)",
	},
	previousOwnerId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		field: "previous_owner_id",
		comment: "Previous owner global user ID (for ownership transfer)",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "created_at",
		defaultValue: DataTypes.NOW,
	},
	updatedAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "updated_at",
		defaultValue: DataTypes.NOW,
	},
};
