import type { Org, OrgStatus, OrgSummary } from "../../types";
import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** Internal model interface matching database schema */
export interface OrgRow {
	readonly id: string;
	readonly tenantId: string;
	readonly slug: string;
	readonly displayName: string;
	readonly schemaName: string;
	readonly status: OrgStatus;
	readonly isDefault: boolean;
	readonly schemaRetained: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function defineOrgs(sequelize: Sequelize): ModelDef<OrgRow> {
	return sequelize.define("org", schema, {
		timestamps: true,
		underscored: true,
		tableName: "orgs",
	});
}

const schema = {
	id: {
		type: DataTypes.UUID,
		defaultValue: DataTypes.UUIDV4,
		primaryKey: true,
	},
	tenantId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "tenant_id",
		references: {
			model: "tenants",
			key: "id",
		},
	},
	slug: {
		type: DataTypes.STRING(63),
		allowNull: false,
		validate: {
			is: /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
		},
	},
	displayName: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "display_name",
	},
	schemaName: {
		type: DataTypes.STRING(63),
		allowNull: false,
		field: "schema_name",
	},
	status: {
		type: DataTypes.ENUM("provisioning", "active", "suspended", "archived"),
		allowNull: false,
		defaultValue: "provisioning",
	},
	isDefault: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_default",
	},
	schemaRetained: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "schema_retained",
	},
};

/** Convert database row to API type */
export function toOrg(row: OrgRow): Org {
	return {
		id: row.id,
		tenantId: row.tenantId,
		slug: row.slug,
		displayName: row.displayName,
		schemaName: row.schemaName,
		status: row.status,
		isDefault: row.isDefault,
		schemaRetained: row.schemaRetained,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/** Convert database row to summary type */
export function toOrgSummary(row: OrgRow): OrgSummary {
	return {
		id: row.id,
		tenantId: row.tenantId,
		slug: row.slug,
		displayName: row.displayName,
		schemaName: row.schemaName,
		status: row.status,
		isDefault: row.isDefault,
		createdAt: row.createdAt,
	};
}
