import type { DeploymentType, Tenant, TenantFeatureFlags, TenantStatus, TenantSummary } from "../../types";
import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** Internal model interface matching database schema */
export interface TenantRow {
	readonly id: string;
	readonly slug: string;
	readonly displayName: string;
	readonly status: TenantStatus;
	readonly deploymentType: DeploymentType;
	readonly databaseProviderId: string;
	readonly configs: Record<string, unknown>;
	readonly configsUpdatedAt: Date | null;
	readonly featureFlags: TenantFeatureFlags;
	readonly primaryDomain: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly provisionedAt: Date | null;
}

export function defineTenants(sequelize: Sequelize): ModelDef<TenantRow> {
	return sequelize.define("tenant", schema, {
		timestamps: true,
		underscored: true,
		tableName: "tenants",
		indexes: [
			{
				fields: ["slug"],
				name: "tenants_slug_key",
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
	slug: {
		type: DataTypes.STRING(63),
		allowNull: false,
		// unique: true removed - now defined in indexes above
		validate: {
			is: /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
		},
	},
	displayName: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "display_name",
	},
	status: {
		type: DataTypes.ENUM("provisioning", "active", "suspended", "migrating", "archived"),
		allowNull: false,
		defaultValue: "provisioning",
	},
	deploymentType: {
		type: DataTypes.ENUM("shared", "isolated"),
		allowNull: false,
		defaultValue: "shared",
		field: "deployment_type",
	},
	databaseProviderId: {
		type: DataTypes.UUID,
		allowNull: false,
		field: "database_provider_id",
		references: {
			model: "database_providers",
			key: "id",
		},
	},
	configs: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
	},
	configsUpdatedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "configs_updated_at",
	},
	featureFlags: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
		field: "feature_flags",
	},
	primaryDomain: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "primary_domain",
	},
	provisionedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "provisioned_at",
	},
};

/** Convert database row to API type */
export function toTenant(row: TenantRow): Tenant {
	// Ensure featureFlags has valid structure (default to free tier if missing/malformed)
	const featureFlags: TenantFeatureFlags = {
		tier: row.featureFlags?.tier ?? "free",
		subdomain: row.featureFlags?.subdomain ?? false,
		customDomain: row.featureFlags?.customDomain ?? false,
		advancedAnalytics: row.featureFlags?.advancedAnalytics ?? false,
		sso: row.featureFlags?.sso ?? false,
		dedicatedSupport: row.featureFlags?.dedicatedSupport ?? false,
	};

	return {
		id: row.id,
		slug: row.slug,
		displayName: row.displayName,
		status: row.status,
		deploymentType: row.deploymentType,
		databaseProviderId: row.databaseProviderId,
		configs: row.configs,
		configsUpdatedAt: row.configsUpdatedAt,
		featureFlags,
		primaryDomain: row.primaryDomain,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		provisionedAt: row.provisionedAt,
	};
}

/** Convert database row to summary type */
export function toTenantSummary(row: TenantRow): TenantSummary {
	return {
		id: row.id,
		slug: row.slug,
		displayName: row.displayName,
		status: row.status,
		deploymentType: row.deploymentType,
		databaseProviderId: row.databaseProviderId,
		createdAt: row.createdAt,
		provisionedAt: row.provisionedAt,
	};
}
