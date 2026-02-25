import { getLog } from "../util/Logger";
import type { TenantDatabaseConfig } from "./TenantDatabaseConfig";
import { createRegistrySequelize } from "./TenantSequelizeFactory";
import type { Org, OrgSummary, Tenant, TenantSummary } from "jolli-common";
import type { Sequelize, Transaction } from "sequelize";

const log = getLog(import.meta);

/**
 * Client for querying the tenant registry database.
 * Connects directly to the manager's registry database.
 */
/** Result of looking up a tenant by custom domain */
export interface TenantByDomainResult {
	tenant: Tenant;
	org: Org;
}

/** Result of looking up a tenant by GitHub installation ID */
export interface TenantOrgByInstallationResult {
	tenant: Tenant;
	org: Org;
}

/** Parameters for creating a GitHub installation mapping */
export interface CreateInstallationMappingParams {
	installationId: number;
	tenantId: string;
	orgId: string;
	githubAccountLogin: string;
	githubAccountType: "Organization" | "User";
}

/** Tenant with its default org for tenant switcher */
export interface TenantWithDefaultOrg {
	id: string;
	slug: string;
	displayName: string;
	primaryDomain: string | null;
	defaultOrgId: string;
}

export interface TenantRegistryClient {
	// Tenant methods
	getTenant(id: string): Promise<Tenant | undefined>;
	getTenantBySlug(slug: string): Promise<Tenant | undefined>;
	listTenants(): Promise<Array<TenantSummary>>;
	/** List active tenants with their default org (single query, for tenant switcher) */
	listTenantsWithDefaultOrg(): Promise<Array<TenantWithDefaultOrg>>;
	/** List all active tenants (for migration scripts) */
	listAllActiveTenants(): Promise<Array<Tenant>>;

	// Domain methods
	/** Look up tenant and default org by verified custom domain */
	getTenantByDomain(domain: string): Promise<TenantByDomainResult | undefined>;

	// Database config methods (backend-only, not included in Tenant interface)
	/** Get database connection config for a tenant by ID */
	getTenantDatabaseConfig(tenantId: string): Promise<TenantDatabaseConfig | undefined>;

	// Org methods
	getOrg(id: string): Promise<Org | undefined>;
	getOrgBySlug(tenantId: string, slug: string): Promise<Org | undefined>;
	getDefaultOrg(tenantId: string): Promise<Org | undefined>;
	listOrgs(tenantId: string): Promise<Array<OrgSummary>>;
	/** List all active orgs for a tenant (for migration scripts) */
	listAllActiveOrgs(tenantId: string): Promise<Array<Org>>;

	// GitHub Installation Mapping methods
	/** Look up tenant and org by GitHub installation ID */
	getTenantOrgByInstallationId(installationId: number): Promise<TenantOrgByInstallationResult | undefined>;
	/** Create a mapping from GitHub installation ID to tenant/org */
	createInstallationMapping(params: CreateInstallationMappingParams): Promise<void>;
	/**
	 * Ensure a GitHub installation mapping exists (safe gap-filler).
	 * Uses INSERT ... ON CONFLICT DO NOTHING — can only fill gaps, never overwrites
	 * an existing mapping owned by another tenant.
	 * @returns true if a new mapping was created, false if one already existed.
	 */
	ensureInstallationMapping(params: CreateInstallationMappingParams): Promise<boolean>;
	/** Delete a GitHub installation mapping */
	deleteInstallationMapping(installationId: number): Promise<void>;

	// Lifecycle
	close(): Promise<void>;
}

export interface TenantRegistryClientConfig {
	registryDatabaseUrl: string;
	poolMax?: number;
}

/**
 * Internal config that allows injecting a sequelize instance for testing.
 */
export interface TenantRegistryClientInternalConfig extends TenantRegistryClientConfig {
	/** For testing - inject a sequelize instance instead of creating one */
	sequelize?: Sequelize;
}

/**
 * Create a client for querying the tenant registry database.
 */
export function createTenantRegistryClient(config: TenantRegistryClientInternalConfig): TenantRegistryClient {
	const sequelize = config.sequelize ?? createRegistrySequelize(config.registryDatabaseUrl, config.poolMax ?? 5);

	log.info("TenantRegistryClient initialized");

	async function getTenant(id: string): Promise<Tenant | undefined> {
		// Join with tenant_domains to get primary verified domain
		const [rows] = await sequelize.query(
			`SELECT t.*, d.domain as primary_domain
			FROM tenants t
			LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			WHERE t.id = $1`,
			{
				bind: [id],
			},
		);
		const row = rows[0] as TenantRow | undefined;
		return row ? mapRowToTenant(row) : undefined;
	}

	async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
		// Join with tenant_domains to get primary verified domain
		const [rows] = await sequelize.query(
			`SELECT t.*, d.domain as primary_domain
			FROM tenants t
			LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			WHERE t.slug = $1`,
			{
				bind: [slug],
			},
		);
		const row = rows[0] as TenantRow | undefined;
		return row ? mapRowToTenant(row) : undefined;
	}

	async function listTenants(): Promise<Array<TenantSummary>> {
		const [rows] = await sequelize.query(
			`SELECT t.id, t.slug, t.display_name, t.status, t.deployment_type, t.created_at, t.provisioned_at,
			        d.domain as primary_domain
			 FROM tenants t
			 LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			 ORDER BY t.created_at DESC`,
		);
		return (rows as Array<TenantRow>).map(mapRowToTenantSummary);
	}

	async function listTenantsWithDefaultOrg(): Promise<Array<TenantWithDefaultOrg>> {
		// Single query to get active tenants with their default org (avoids N+1 problem)
		const [rows] = await sequelize.query(
			`SELECT t.id, t.slug, t.display_name, d.domain as primary_domain, o.id as default_org_id
			 FROM tenants t
			 JOIN orgs o ON o.tenant_id = t.id AND o.is_default = true
			 LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			 WHERE t.status = 'active'
			 ORDER BY t.created_at DESC`,
		);
		return (rows as Array<TenantWithDefaultOrgRow>).map(row => ({
			id: row.id,
			slug: row.slug,
			displayName: row.display_name,
			primaryDomain: row.primary_domain,
			defaultOrgId: row.default_org_id,
		}));
	}

	async function getTenantDatabaseConfig(tenantId: string): Promise<TenantDatabaseConfig | undefined> {
		// JOIN with database_providers to get credentials (credentials now live on provider, not tenant)
		const [rows] = await sequelize.query(
			`SELECT t.id as tenant_id,
			        p.database_host, p.database_port, p.database_name, p.database_username,
			        p.database_password_encrypted, p.database_ssl, p.database_pool_max
			 FROM tenants t
			 JOIN database_providers p ON t.database_provider_id = p.id
			 WHERE t.id = $1`,
			{ bind: [tenantId] },
		);
		const row = rows[0] as TenantDatabaseConfigRow | undefined;
		return row ? mapRowToTenantDatabaseConfig(row) : undefined;
	}

	async function getTenantByDomain(domain: string): Promise<TenantByDomainResult | undefined> {
		// Look up verified domain in tenant_domains table and join with tenant and default org
		const [rows] = await sequelize.query(
			`SELECT
				t.*,
				d.domain as primary_domain,
				o.id as org_id, o.tenant_id as org_tenant_id, o.slug as org_slug,
				o.display_name as org_display_name, o.schema_name as org_schema_name,
				o.status as org_status, o.is_default as org_is_default,
				o.created_at as org_created_at, o.updated_at as org_updated_at
			FROM tenant_domains d
			JOIN tenants t ON d.tenant_id = t.id
			JOIN orgs o ON o.tenant_id = t.id AND o.is_default = true
			WHERE d.domain = $1 AND d.verified_at IS NOT NULL AND t.status = 'active'`,
			{ bind: [domain.toLowerCase()] },
		);
		const row = rows[0] as TenantWithJoinedOrgRow | undefined;
		if (!row) {
			return;
		}

		return {
			tenant: mapRowToTenant(row),
			org: mapJoinedRowToOrg(row),
		};
	}

	async function getOrg(id: string): Promise<Org | undefined> {
		const [rows] = await sequelize.query("SELECT * FROM orgs WHERE id = $1", {
			bind: [id],
		});
		const row = rows[0] as OrgRow | undefined;
		return row ? mapRowToOrg(row) : undefined;
	}

	async function getOrgBySlug(tenantId: string, slug: string): Promise<Org | undefined> {
		const [rows] = await sequelize.query("SELECT * FROM orgs WHERE tenant_id = $1 AND slug = $2", {
			bind: [tenantId, slug],
		});
		const row = rows[0] as OrgRow | undefined;
		return row ? mapRowToOrg(row) : undefined;
	}

	async function getDefaultOrg(tenantId: string): Promise<Org | undefined> {
		const [rows] = await sequelize.query("SELECT * FROM orgs WHERE tenant_id = $1 AND is_default = true", {
			bind: [tenantId],
		});
		const row = rows[0] as OrgRow | undefined;
		return row ? mapRowToOrg(row) : undefined;
	}

	async function listOrgs(tenantId: string): Promise<Array<OrgSummary>> {
		const [rows] = await sequelize.query(
			"SELECT id, tenant_id, slug, display_name, schema_name, status, is_default, created_at FROM orgs WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC",
			{ bind: [tenantId] },
		);
		// OrgRow is a superset of what we select, but has the same field types
		return (rows as Array<OrgRow>).map(mapRowToOrgSummary);
	}

	async function listAllActiveTenants(): Promise<Array<Tenant>> {
		const [rows] = await sequelize.query(
			`SELECT t.*, d.domain as primary_domain
			 FROM tenants t
			 LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			 WHERE t.status = 'active'
			 ORDER BY t.created_at ASC`,
		);
		return (rows as Array<TenantRow>).map(mapRowToTenant);
	}

	async function listAllActiveOrgs(tenantId: string): Promise<Array<Org>> {
		const [rows] = await sequelize.query(
			"SELECT * FROM orgs WHERE tenant_id = $1 AND status = 'active' ORDER BY is_default DESC, created_at ASC",
			{ bind: [tenantId] },
		);
		return (rows as Array<OrgRow>).map(mapRowToOrg);
	}

	async function getTenantOrgByInstallationId(
		installationId: number,
	): Promise<TenantOrgByInstallationResult | undefined> {
		// Look up the installation mapping and join with tenant and org tables
		const [rows] = await sequelize.query(
			`SELECT
				t.*,
				d.domain as primary_domain,
				o.id as org_id, o.tenant_id as org_tenant_id, o.slug as org_slug,
				o.display_name as org_display_name, o.schema_name as org_schema_name,
				o.status as org_status, o.is_default as org_is_default,
				o.created_at as org_created_at, o.updated_at as org_updated_at
			FROM github_installation_mappings m
			JOIN tenants t ON m.tenant_id = t.id
			JOIN orgs o ON m.org_id = o.id
			LEFT JOIN tenant_domains d ON d.tenant_id = t.id AND d.is_primary = true AND d.verified_at IS NOT NULL
			WHERE m.installation_id = $1 AND t.status = 'active' AND o.status = 'active'`,
			{ bind: [installationId] },
		);
		const row = rows[0] as TenantWithJoinedOrgRow | undefined;
		if (!row) {
			return;
		}

		return {
			tenant: mapRowToTenant(row),
			org: mapJoinedRowToOrg(row),
		};
	}

	/**
	 * Delete stale installation mappings for the same GitHub account but a different installation ID.
	 * GitHub only allows one installation of a given app per org/user at a time, so if a new
	 * installation ID exists for the same account, any older mappings are definitively stale.
	 */
	async function deleteStaleInstallationMappings(
		githubAccountLogin: string,
		installationId: number,
		transaction: Transaction,
	): Promise<number> {
		const [, deleted] = await sequelize.query(
			`DELETE FROM github_installation_mappings
			 WHERE github_account_login = $1
			   AND installation_id != $2`,
			{
				bind: [githubAccountLogin, installationId],
				transaction,
			},
		);
		return deleted as number;
	}

	async function createInstallationMapping(params: CreateInstallationMappingParams): Promise<void> {
		await sequelize.transaction(async transaction => {
			const deleted = await deleteStaleInstallationMappings(
				params.githubAccountLogin,
				params.installationId,
				transaction,
			);
			if (deleted > 0) {
				log.info(
					{ githubAccountLogin: params.githubAccountLogin, deleted },
					"Cleaned up %d stale installation mapping(s) for %s",
					deleted,
					params.githubAccountLogin,
				);
			}

			const id = crypto.randomUUID();
			await sequelize.query(
				`INSERT INTO github_installation_mappings
					(id, installation_id, tenant_id, org_id, github_account_login, github_account_type, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
				ON CONFLICT (installation_id)
				DO UPDATE SET
					tenant_id = EXCLUDED.tenant_id,
					org_id = EXCLUDED.org_id,
					github_account_login = EXCLUDED.github_account_login,
					github_account_type = EXCLUDED.github_account_type,
					updated_at = NOW()`,
				{
					bind: [
						id,
						params.installationId,
						params.tenantId,
						params.orgId,
						params.githubAccountLogin,
						params.githubAccountType,
					],
					transaction,
				},
			);
		});
		log.info(
			{ installationId: params.installationId, tenantId: params.tenantId, orgId: params.orgId },
			"Created GitHub installation mapping for installation %d",
			params.installationId,
		);
	}

	async function ensureInstallationMapping(params: CreateInstallationMappingParams): Promise<boolean> {
		let created = false;
		await sequelize.transaction(async transaction => {
			const deleted = await deleteStaleInstallationMappings(
				params.githubAccountLogin,
				params.installationId,
				transaction,
			);
			if (deleted > 0) {
				log.info(
					{ githubAccountLogin: params.githubAccountLogin, deleted },
					"Cleaned up %d stale installation mapping(s) for %s",
					deleted,
					params.githubAccountLogin,
				);
			}

			const id = crypto.randomUUID();
			const [, rowCount] = await sequelize.query(
				`INSERT INTO github_installation_mappings
					(id, installation_id, tenant_id, org_id, github_account_login, github_account_type, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
				ON CONFLICT (installation_id) DO NOTHING`,
				{
					bind: [
						id,
						params.installationId,
						params.tenantId,
						params.orgId,
						params.githubAccountLogin,
						params.githubAccountType,
					],
					transaction,
				},
			);
			created = (rowCount as number) > 0;
		});
		if (created) {
			log.info(
				{ installationId: params.installationId, tenantId: params.tenantId, orgId: params.orgId },
				"Created GitHub installation mapping (gap-fill) for installation %d",
				params.installationId,
			);
		}
		return created;
	}

	async function deleteInstallationMapping(installationId: number): Promise<void> {
		await sequelize.query("DELETE FROM github_installation_mappings WHERE installation_id = $1", {
			bind: [installationId],
		});
		log.info({ installationId }, "Deleted GitHub installation mapping for installation %d", installationId);
	}

	async function close(): Promise<void> {
		log.info("Closing TenantRegistryClient connection");
		await sequelize.close();
	}

	return {
		getTenant,
		getTenantBySlug,
		getTenantByDomain,
		getTenantDatabaseConfig,
		listTenants,
		listTenantsWithDefaultOrg,
		listAllActiveTenants,
		getOrg,
		getOrgBySlug,
		getDefaultOrg,
		listOrgs,
		listAllActiveOrgs,
		getTenantOrgByInstallationId,
		createInstallationMapping,
		ensureInstallationMapping,
		deleteInstallationMapping,
		close,
	};
}

// Raw row types from database queries (snake_case column names)
// These provide explicit typing for query results before mapping to domain types

/** Raw tenant with default org row from database query */
interface TenantWithDefaultOrgRow {
	id: string;
	slug: string;
	display_name: string;
	primary_domain: string | null;
	default_org_id: string;
}

/** Raw tenant row from database query */
interface TenantRow {
	id: string;
	slug: string;
	display_name: string;
	status: string;
	deployment_type: string;
	database_provider_id: string;
	configs: Record<string, unknown> | null;
	configs_updated_at: string | null;
	feature_flags: Record<string, boolean> | null;
	primary_domain: string | null;
	created_at: string;
	updated_at: string;
	provisioned_at: string | null;
}

/** Raw tenant database config row from database query (credentials come from provider via JOIN) */
interface TenantDatabaseConfigRow {
	tenant_id: string;
	database_host: string;
	database_port: number;
	database_name: string;
	database_username: string;
	database_password_encrypted: string;
	database_ssl: boolean;
	database_pool_max: number;
}

/** Raw org row from database query */
interface OrgRow {
	id: string;
	tenant_id: string;
	slug: string;
	display_name: string;
	schema_name: string;
	status: string;
	is_default: boolean;
	created_at: string;
	updated_at: string;
}

/** Joined query row with tenant and org columns (org prefixed with org_) */
interface TenantWithJoinedOrgRow extends TenantRow {
	org_id: string;
	org_tenant_id: string;
	org_slug: string;
	org_display_name: string;
	org_schema_name: string;
	org_status: string;
	org_is_default: boolean;
	org_created_at: string;
	org_updated_at: string;
}

// Row mapping functions (snake_case to camelCase)

function mapRowToTenant(row: TenantRow): Tenant {
	return {
		id: row.id,
		slug: row.slug,
		displayName: row.display_name,
		status: row.status as Tenant["status"],
		deploymentType: row.deployment_type as Tenant["deploymentType"],
		databaseProviderId: row.database_provider_id,
		configs: row.configs ?? {},
		configsUpdatedAt: row.configs_updated_at ? new Date(row.configs_updated_at) : null,
		featureFlags: row.feature_flags ?? {},
		primaryDomain: row.primary_domain,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		provisionedAt: row.provisioned_at ? new Date(row.provisioned_at) : null,
	};
}

function mapRowToTenantDatabaseConfig(row: TenantDatabaseConfigRow): TenantDatabaseConfig {
	return {
		tenantId: row.tenant_id,
		databaseHost: row.database_host,
		databasePort: row.database_port,
		databaseName: row.database_name,
		databaseUsername: row.database_username,
		databasePasswordEncrypted: row.database_password_encrypted,
		databaseSsl: row.database_ssl,
		databasePoolMax: row.database_pool_max,
	};
}

function mapRowToTenantSummary(row: TenantRow): TenantSummary {
	return {
		id: row.id,
		slug: row.slug,
		displayName: row.display_name,
		status: row.status as TenantSummary["status"],
		deploymentType: row.deployment_type as TenantSummary["deploymentType"],
		primaryDomain: row.primary_domain,
		createdAt: new Date(row.created_at),
		provisionedAt: row.provisioned_at ? new Date(row.provisioned_at) : null,
	};
}

function mapRowToOrg(row: OrgRow): Org {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		slug: row.slug,
		displayName: row.display_name,
		schemaName: row.schema_name,
		status: row.status as Org["status"],
		isDefault: row.is_default,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
	};
}

/** Map org fields from a joined query row with org_ prefixed columns */
function mapJoinedRowToOrg(row: TenantWithJoinedOrgRow): Org {
	return {
		id: row.org_id,
		tenantId: row.org_tenant_id,
		slug: row.org_slug,
		displayName: row.org_display_name,
		schemaName: row.org_schema_name,
		status: row.org_status as Org["status"],
		isDefault: row.org_is_default,
		createdAt: new Date(row.org_created_at),
		updatedAt: new Date(row.org_updated_at),
	};
}

function mapRowToOrgSummary(row: OrgRow): OrgSummary {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		slug: row.slug,
		displayName: row.display_name,
		schemaName: row.schema_name,
		status: row.status as OrgSummary["status"],
		isDefault: row.is_default,
		createdAt: new Date(row.created_at),
	};
}
