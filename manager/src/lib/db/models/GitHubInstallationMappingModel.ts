import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** Row type for GitHub installation to tenant/org mapping */
export interface GitHubInstallationMappingRow {
	readonly id: string;
	readonly installationId: number;
	readonly tenantId: string;
	readonly orgId: string;
	readonly githubAccountLogin: string;
	readonly githubAccountType: "Organization" | "User";
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function defineGitHubInstallationMappings(sequelize: Sequelize): ModelDef<GitHubInstallationMappingRow> {
	return sequelize.define("github_installation_mapping", schema, {
		timestamps: true,
		underscored: true,
		tableName: "github_installation_mappings",
		indexes: [
			{
				fields: ["installation_id"],
				name: "github_installation_mappings_installation_id_key",
				unique: true,
			},
		],
	});
}

const schema = {
	id: {
		type: DataTypes.UUID,
		defaultValue: DataTypes.UUIDV4,
		primaryKey: true,
	},
	installationId: {
		type: DataTypes.BIGINT,
		allowNull: false,
		// unique: true removed - now defined in indexes above (One mapping per installation)
		field: "installation_id",
	},
	tenantId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "tenant_id",
		references: {
			model: "tenants",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	orgId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "org_id",
		references: {
			model: "orgs",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	githubAccountLogin: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "github_account_login",
	},
	githubAccountType: {
		type: DataTypes.ENUM("Organization", "User"),
		allowNull: false,
		field: "github_account_type",
	},
};
