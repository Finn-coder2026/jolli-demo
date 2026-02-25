import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Owner invitation record for tracking pending owner invitations.
 * Stored in Manager DB, linked to verifications table via verificationId.
 */
export interface OwnerInvitationRow {
	readonly id: number;
	readonly verificationId: number | null;
	readonly email: string;
	readonly name: string | null;
	readonly tenantId: string;
	readonly orgId: string;
	readonly invitedBy: number;
	readonly previousOwnerId: number | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing owner invitation type */
export interface OwnerInvitation {
	id: number;
	verificationId: number | null;
	email: string;
	name: string | null;
	tenantId: string;
	orgId: string;
	invitedBy: number;
	previousOwnerId: number | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new owner invitation */
export interface NewOwnerInvitation {
	verificationId?: number | null;
	email: string;
	name?: string | null;
	tenantId: string;
	orgId: string;
	invitedBy: number;
	previousOwnerId?: number | null;
}

export function defineOwnerInvitations(sequelize: Sequelize): ModelDef<OwnerInvitationRow> {
	const existing = sequelize.models?.OwnerInvitation;
	if (existing) {
		return existing as ModelDef<OwnerInvitationRow>;
	}
	return sequelize.define("OwnerInvitation", schema, {
		timestamps: true,
		underscored: true,
		tableName: "owner_invitations",
		indexes: [
			{
				fields: ["verification_id"],
				name: "owner_invitations_verification_id_key",
				unique: true,
			},
			{
				fields: ["tenant_id", "org_id"],
				name: "idx_owner_invitations_tenant_org",
			},
			{
				fields: ["email"],
				name: "idx_owner_invitations_email",
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
	verificationId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		field: "verification_id",
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: true,
	},
	tenantId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "tenant_id",
	},
	orgId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "org_id",
	},
	invitedBy: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "invited_by",
	},
	previousOwnerId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		field: "previous_owner_id",
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

/** Convert database row to API type */
export function toOwnerInvitation(row: OwnerInvitationRow): OwnerInvitation {
	return {
		id: row.id,
		verificationId: row.verificationId,
		email: row.email,
		name: row.name,
		tenantId: row.tenantId,
		orgId: row.orgId,
		invitedBy: row.invitedBy,
		previousOwnerId: row.previousOwnerId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
