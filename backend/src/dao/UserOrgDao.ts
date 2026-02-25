import type { UserOrg } from "../model/UserOrg.js";
import { defineUserOrgs } from "../model/UserOrg.js";
import { QueryTypes, type Sequelize, type Transaction } from "sequelize";

/**
 * Tenant information for user display (one row per user-org relationship)
 */
export interface UserTenantInfo {
	tenantId: string;
	orgId: string;
	tenantSlug: string; // Tenant slug
	tenantName: string; // Tenant display name
	orgSlug: string; // Organization slug
	orgName: string; // Organization display name
	role: string;
	isDefault: boolean;
	lastAccessedAt?: Date | undefined;
	url: string; // Full URL to access this tenant
	// Tenant-specific config for authorization checks
	authEmails?: string | undefined; // AUTH_EMAILS config from tenant.configs
	// Feature flags for URL generation
	featureFlags?: Record<string, unknown> | undefined; // Feature flags JSONB column
	primaryDomain?: string | undefined | null; // Custom domain if configured
}

/**
 * Unique tenant summary for tenant switcher (one row per tenant, with default org)
 */
export interface UserTenantSummary {
	tenantId: string;
	tenantSlug: string;
	tenantName: string;
	defaultOrgId: string; // The user's default org for this tenant
}

/**
 * Org summary for org switcher (orgs within a specific tenant)
 */
export interface UserOrgSummary {
	orgId: string;
	orgSlug: string;
	orgName: string;
	isDefault: boolean;
}

/**
 * Data Access Object for user-organization relationships
 */
export interface UserOrgDao {
	/**
	 * Get all organizations for a user
	 */
	getUserOrgs(userId: number): Promise<Array<UserOrg>>;

	/**
	 * Get tenant information for a user (joined with tenants table)
	 * Returns one row per user-org relationship.
	 */
	getUserTenants(userId: number): Promise<Array<UserTenantInfo>>;

	/**
	 * Get unique tenants for a user (for TenantSwitcher).
	 * Returns one row per tenant, with the user's default org for each tenant.
	 * Grouping is done in SQL for efficiency.
	 */
	getUniqueTenants(userId: number): Promise<Array<UserTenantSummary>>;

	/**
	 * Get orgs for a user within a specific tenant (for OrgSwitcher).
	 * Returns only orgs belonging to the specified tenant.
	 */
	getOrgsForTenant(userId: number, tenantId: string): Promise<Array<UserOrgSummary>>;

	/**
	 * Create a new user-org relationship
	 */
	createUserOrg(
		data: {
			userId: number;
			tenantId: string;
			orgId: string;
			role?: string;
			isDefault?: boolean;
		},
		transaction?: Transaction,
	): Promise<UserOrg>;

	/**
	 * Update last accessed timestamp
	 */
	updateLastAccessed(userId: number, tenantId: string, orgId: string): Promise<void>;

	/**
	 * Set default tenant for user
	 */
	setDefaultTenant(userId: number, tenantId: string, orgId: string): Promise<void>;

	/**
	 * Delete user-org relationship
	 */
	deleteUserOrg(userId: number, tenantId: string, orgId: string): Promise<void>;

	/**
	 * Update user's role in an org
	 */
	updateRole(userId: number, tenantId: string, orgId: string, role: string, transaction?: Transaction): Promise<void>;
}

/**
 * Create a UserOrgDao instance
 */
export function createUserOrgDao(sequelize: Sequelize): UserOrgDao {
	const UserOrgs = defineUserOrgs(sequelize);

	return {
		getUserOrgs,
		getUserTenants,
		getUniqueTenants,
		getOrgsForTenant,
		createUserOrg,
		updateLastAccessed,
		setDefaultTenant,
		deleteUserOrg,
		updateRole,
	};

	async function getUserOrgs(userId: number): Promise<Array<UserOrg>> {
		const results = await UserOrgs.findAll({
			where: { userId },
			order: [
				["isDefault", "DESC"],
				["lastAccessedAt", "DESC NULLS LAST"],
			],
		});
		return results.map(r => r.get({ plain: true }) as UserOrg);
	}

	async function getUserTenants(userId: number): Promise<Array<UserTenantInfo>> {
		// Join with tenants and orgs tables to get complete information
		// Include tenant's AUTH_EMAILS config, feature_flags, and primary_domain for URL generation
		const results = await sequelize.query<UserTenantInfo>(
			`
			SELECT
				uo.tenant_id as "tenantId",
				uo.org_id as "orgId",
				t.slug as "tenantSlug",
				t.display_name as "tenantName",
				o.slug as "orgSlug",
				o.display_name as "orgName",
				uo.role,
				uo.is_default as "isDefault",
				uo.last_accessed_at as "lastAccessedAt",
				t.configs->>'AUTH_EMAILS' as "authEmails",
				t.feature_flags as "featureFlags",
				t.primary_domain as "primaryDomain"
			FROM user_orgs uo
			JOIN tenants t ON uo.tenant_id = t.id
			JOIN orgs o ON uo.org_id = o.id
			WHERE uo.user_id = :userId
			ORDER BY uo.is_default DESC, uo.last_accessed_at DESC NULLS LAST
			`,
			{
				replacements: { userId },
				type: QueryTypes.SELECT,
			},
		);
		return results;
	}

	async function getUniqueTenants(userId: number): Promise<Array<UserTenantSummary>> {
		// Get unique tenants with the user's default org for each tenant.
		// Uses DISTINCT ON to get one row per tenant, preferring the default org.
		const results = await sequelize.query<UserTenantSummary>(
			`
			SELECT DISTINCT ON (uo.tenant_id)
				uo.tenant_id as "tenantId",
				t.slug as "tenantSlug",
				t.display_name as "tenantName",
				uo.org_id as "defaultOrgId"
			FROM user_orgs uo
			JOIN tenants t ON uo.tenant_id = t.id
			WHERE uo.user_id = :userId
			ORDER BY uo.tenant_id, uo.is_default DESC, uo.last_accessed_at DESC NULLS LAST
			`,
			{
				replacements: { userId },
				type: QueryTypes.SELECT,
			},
		);
		return results;
	}

	async function getOrgsForTenant(userId: number, tenantId: string): Promise<Array<UserOrgSummary>> {
		// Get orgs for a specific tenant that the user has access to.
		const results = await sequelize.query<UserOrgSummary>(
			`
			SELECT
				uo.org_id as "orgId",
				o.slug as "orgSlug",
				o.display_name as "orgName",
				uo.is_default as "isDefault"
			FROM user_orgs uo
			JOIN orgs o ON uo.org_id = o.id
			WHERE uo.user_id = :userId AND uo.tenant_id = :tenantId
			ORDER BY uo.is_default DESC, uo.last_accessed_at DESC NULLS LAST
			`,
			{
				replacements: { userId, tenantId },
				type: QueryTypes.SELECT,
			},
		);
		return results;
	}

	async function createUserOrg(
		data: {
			userId: number;
			tenantId: string;
			orgId: string;
			role?: string;
			isDefault?: boolean;
		},
		transaction?: Transaction,
	): Promise<UserOrg> {
		const result = await UserOrgs.create(
			{
				userId: data.userId,
				tenantId: data.tenantId,
				orgId: data.orgId,
				role: data.role ?? "member",
				isDefault: data.isDefault ?? false,
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize create() requires all fields including auto-generated ones
			} as any,
			{ transaction: transaction ?? null },
		);
		return result.get({ plain: true }) as UserOrg;
	}

	async function updateLastAccessed(userId: number, tenantId: string, orgId: string): Promise<void> {
		await UserOrgs.update(
			{ lastAccessedAt: new Date() },
			{
				where: { userId, tenantId, orgId },
			},
		);
	}

	async function setDefaultTenant(userId: number, tenantId: string, orgId: string): Promise<void> {
		// Unset all defaults for this user first
		await UserOrgs.update(
			{ isDefault: false },
			{
				where: { userId },
			},
		);

		// Set the new default
		await UserOrgs.update(
			{ isDefault: true },
			{
				where: { userId, tenantId, orgId },
			},
		);
	}

	async function deleteUserOrg(userId: number, tenantId: string, orgId: string): Promise<void> {
		await UserOrgs.destroy({
			where: { userId, tenantId, orgId },
		});
	}

	async function updateRole(
		userId: number,
		tenantId: string,
		orgId: string,
		role: string,
		transaction?: Transaction,
	): Promise<void> {
		await UserOrgs.update({ role }, { where: { userId, tenantId, orgId }, transaction: transaction ?? null });
	}
}
