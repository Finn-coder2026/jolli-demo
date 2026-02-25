import type { DatabaseConnectionTemplate, DatabaseProvider, ProviderStatus, ProviderType } from "../../types";
import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** Internal model interface matching database schema */
export interface DatabaseProviderRow {
	readonly id: string;
	readonly name: string;
	readonly slug: string;
	readonly type: ProviderType;
	readonly status: ProviderStatus;
	readonly isDefault: boolean;
	readonly region: string;
	readonly configEncrypted: string | null;
	readonly connectionTemplate: DatabaseConnectionTemplate | null;
	readonly databaseHost: string | null;
	readonly databasePort: number;
	readonly databaseName: string | null;
	readonly databaseUsername: string | null;
	readonly databasePasswordEncrypted: string | null;
	readonly databaseSsl: boolean;
	readonly databasePoolMax: number;
	readonly databaseRetained: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly provisionedAt: Date | null;
}

export function defineDatabaseProviders(sequelize: Sequelize): ModelDef<DatabaseProviderRow> {
	return sequelize.define("database_provider", schema, {
		timestamps: true,
		underscored: true,
		tableName: "database_providers",
		indexes: [
			{
				fields: ["slug"],
				name: "database_providers_slug_key",
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
	name: {
		type: DataTypes.STRING(100),
		allowNull: false,
	},
	slug: {
		type: DataTypes.STRING(50),
		allowNull: false,
		// unique: true removed - now defined in indexes above
		validate: {
			is: /^[a-z0-9_]+$/,
		},
	},
	type: {
		// Note: "local" is kept for backward compatibility, maps to "connection_string"
		type: DataTypes.ENUM("local", "connection_string", "neon"),
		allowNull: false,
	},
	status: {
		type: DataTypes.ENUM("pending", "provisioning", "active", "suspended", "archived"),
		allowNull: false,
		defaultValue: "pending",
	},
	isDefault: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_default",
	},
	region: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "us-west-2",
	},
	configEncrypted: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "config_encrypted",
	},
	connectionTemplate: {
		type: DataTypes.JSONB,
		allowNull: true,
		field: "connection_template",
	},
	databaseHost: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "database_host",
	},
	databasePort: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 5432,
		field: "database_port",
	},
	databaseName: {
		type: DataTypes.STRING(63),
		allowNull: true,
		field: "database_name",
	},
	databaseUsername: {
		type: DataTypes.STRING(63),
		allowNull: true,
		field: "database_username",
	},
	databasePasswordEncrypted: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "database_password_encrypted",
	},
	databaseSsl: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: true,
		field: "database_ssl",
	},
	databasePoolMax: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 20,
		field: "database_pool_max",
	},
	databaseRetained: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "database_retained",
	},
	provisionedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "provisioned_at",
	},
};

/** Convert database row to API type */
export function toProvider(row: DatabaseProviderRow): DatabaseProvider {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		type: row.type,
		status: row.status,
		isDefault: row.isDefault,
		region: row.region,
		configEncrypted: row.configEncrypted,
		connectionTemplate: row.connectionTemplate,
		databaseHost: row.databaseHost,
		databasePort: row.databasePort,
		databaseName: row.databaseName,
		databaseUsername: row.databaseUsername,
		databasePasswordEncrypted: row.databasePasswordEncrypted,
		databaseSsl: row.databaseSsl,
		databasePoolMax: row.databasePoolMax,
		databaseRetained: row.databaseRetained,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		provisionedAt: row.provisionedAt,
	};
}
