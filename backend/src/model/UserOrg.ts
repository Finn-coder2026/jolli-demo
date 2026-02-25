import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * User-Organization relationship record (Manager DB)
 */
export interface UserOrg {
	readonly id: number;
	readonly userId: number;
	readonly tenantId: string;
	readonly orgId: string;
	readonly role: string | null;
	readonly isDefault: boolean;
	readonly lastAccessedAt?: Date | undefined;
	readonly createdAt: Date;
}

/**
 * Define UserOrg model
 */
export function defineUserOrgs(sequelize: Sequelize): ModelDef<UserOrg> {
	const existing = sequelize.models?.UserOrg;
	if (existing) {
		return existing as ModelDef<UserOrg>;
	}
	return sequelize.define("UserOrg", schema, {
		tableName: "user_orgs",
		timestamps: false,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "idx_user_orgs_tenant_id",
		fields: ["tenant_id", "org_id"],
	},
	{
		name: "user_orgs_user_id_tenant_id_org_id_key",
		unique: true,
		fields: ["user_id", "tenant_id", "org_id"],
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
		references: {
			model: "global_users",
			key: "id",
		},
		onDelete: "CASCADE",
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
	role: {
		type: DataTypes.STRING(50), // Matches roles.slug length for custom role slugs
		allowNull: true,
	},
	isDefault: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_default",
	},
	lastAccessedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "last_accessed_at",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "created_at",
	},
};
