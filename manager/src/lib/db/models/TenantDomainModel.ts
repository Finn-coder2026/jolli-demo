import type { SslStatus, TenantDomain } from "../../types";
import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** Internal model interface matching database schema */
export interface TenantDomainRow {
	readonly id: string;
	readonly tenantId: string;
	readonly domain: string;
	readonly isPrimary: boolean;
	readonly sslStatus: SslStatus;
	readonly verificationToken: string | null;
	readonly verifiedAt: Date | null;
	readonly createdAt: Date;
}

export function defineTenantDomains(sequelize: Sequelize): ModelDef<TenantDomainRow> {
	return sequelize.define("tenant_domain", schema, {
		timestamps: true,
		updatedAt: false,
		underscored: true,
		tableName: "tenant_domains",
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
		onDelete: "CASCADE",
	},
	domain: {
		type: DataTypes.STRING(255),
		allowNull: false,
		unique: true,
	},
	isPrimary: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
		field: "is_primary",
	},
	sslStatus: {
		type: DataTypes.ENUM("pending", "active", "failed"),
		allowNull: false,
		defaultValue: "pending",
		field: "ssl_status",
	},
	verificationToken: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "verification_token",
	},
	verifiedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "verified_at",
	},
};

/** Convert database row to API type */
export function toTenantDomain(row: TenantDomainRow): TenantDomain {
	return {
		id: row.id,
		tenantId: row.tenantId,
		domain: row.domain,
		isPrimary: row.isPrimary,
		sslStatus: row.sslStatus,
		verificationToken: row.verificationToken,
		verifiedAt: row.verifiedAt,
		createdAt: row.createdAt,
	};
}
