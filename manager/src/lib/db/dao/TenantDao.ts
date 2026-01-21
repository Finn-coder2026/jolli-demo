import type { DatabaseProvider, NewTenant, Tenant, TenantStatus, TenantSummary } from "../../types";
import type { TenantRow } from "../models";
import { defineDatabaseProviders, defineTenants, toProvider, toTenant, toTenantSummary } from "../models";
import type { Sequelize } from "sequelize";

export interface TenantDao {
	listTenants(): Promise<Array<TenantSummary>>;
	getTenant(id: string): Promise<Tenant | undefined>;
	getTenantBySlug(slug: string): Promise<Tenant | undefined>;
	getTenantsByProviderId(providerId: string): Promise<Array<TenantSummary>>;
	createTenant(tenant: NewTenant, databaseProviderId: string): Promise<Tenant>;
	updateTenant(id: string, updates: Partial<NewTenant> & { status?: TenantStatus }): Promise<Tenant | undefined>;
	updateTenantStatus(id: string, status: TenantStatus): Promise<boolean>;
	markProvisioned(id: string): Promise<boolean>;
	archiveTenant(id: string): Promise<boolean>;
	activateTenant(id: string): Promise<boolean>;
	countActiveOrgs(tenantId: string): Promise<number>;
	deleteTenant(id: string): Promise<boolean>;
}

export function createTenantDao(sequelize: Sequelize): TenantDao {
	const Tenants = defineTenants(sequelize);
	const Providers = defineDatabaseProviders(sequelize);

	/** Helper function to attach provider data to a tenant */
	async function attachProvider(tenant: Tenant): Promise<Tenant> {
		const providerRow = await Providers.findByPk(tenant.databaseProviderId);
		if (providerRow) {
			tenant.databaseProvider = toProvider(providerRow.dataValues);
		}
		return tenant;
	}

	/** Helper function to attach provider data to multiple tenants (batch fetch) */
	async function attachProviders(tenants: Array<TenantSummary>): Promise<void> {
		if (tenants.length === 0) {
			return;
		}

		// Get unique provider IDs
		const providerIds = [...new Set(tenants.map(t => t.databaseProviderId))];

		// Batch fetch all providers
		const providerRows = await Providers.findAll({
			where: { id: providerIds },
		});

		// Create a map for fast lookup
		const providerMap = new Map<string, DatabaseProvider>();
		for (const row of providerRows) {
			providerMap.set(row.dataValues.id, toProvider(row.dataValues));
		}

		// Attach providers to tenants
		for (const tenant of tenants) {
			const provider = providerMap.get(tenant.databaseProviderId);
			if (provider) {
				tenant.databaseProvider = provider;
			}
		}
	}

	async function listTenants(): Promise<Array<TenantSummary>> {
		const rows = await Tenants.findAll({
			order: [["createdAt", "DESC"]],
		});
		const tenants = rows.map(row => toTenantSummary(row.dataValues));
		await attachProviders(tenants);
		return tenants;
	}

	async function getTenant(id: string): Promise<Tenant | undefined> {
		const row = await Tenants.findByPk(id);
		if (!row) {
			return;
		}
		const tenant = toTenant(row.dataValues);
		return attachProvider(tenant);
	}

	async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
		const row = await Tenants.findOne({ where: { slug } });
		if (!row) {
			return;
		}
		const tenant = toTenant(row.dataValues);
		return attachProvider(tenant);
	}

	async function getTenantsByProviderId(providerId: string): Promise<Array<TenantSummary>> {
		const rows = await Tenants.findAll({
			where: { databaseProviderId: providerId },
			order: [["createdAt", "DESC"]],
		});
		return rows.map(row => toTenantSummary(row.dataValues));
	}

	async function createTenant(tenant: NewTenant, databaseProviderId: string): Promise<Tenant> {
		const row = await Tenants.create({
			slug: tenant.slug,
			displayName: tenant.displayName,
			status: "provisioning",
			deploymentType: "shared",
			databaseProviderId,
			configs: tenant.configs ?? {},
			configsUpdatedAt: tenant.configs ? new Date() : null,
			featureFlags: tenant.featureFlags ?? {},
			primaryDomain: null,
			provisionedAt: null,
		} as unknown as TenantRow);
		return toTenant(row.dataValues);
	}

	async function updateTenant(
		id: string,
		updates: Partial<NewTenant> & { status?: TenantStatus },
	): Promise<Tenant | undefined> {
		const row = await Tenants.findByPk(id);
		if (!row) {
			return;
		}

		const updateData: Record<string, unknown> = {};
		if (updates.displayName !== undefined) {
			updateData.displayName = updates.displayName;
		}
		if (updates.configs !== undefined) {
			updateData.configs = updates.configs;
			updateData.configsUpdatedAt = new Date();
		}
		if (updates.featureFlags !== undefined) {
			updateData.featureFlags = updates.featureFlags;
		}
		if (updates.status !== undefined) {
			updateData.status = updates.status;
		}

		await row.update(updateData);
		return toTenant(row.dataValues);
	}

	async function updateTenantStatus(id: string, status: TenantStatus): Promise<boolean> {
		const [updated] = await Tenants.update({ status }, { where: { id } });
		return updated > 0;
	}

	async function markProvisioned(id: string): Promise<boolean> {
		const [updated] = await Tenants.update(
			{
				status: "active",
				provisionedAt: new Date(),
			},
			{ where: { id } },
		);
		return updated > 0;
	}

	async function archiveTenant(id: string): Promise<boolean> {
		const [updated] = await Tenants.update({ status: "archived" }, { where: { id } });
		return updated > 0;
	}

	async function activateTenant(id: string): Promise<boolean> {
		const [updated] = await Tenants.update({ status: "active" }, { where: { id } });
		return updated > 0;
	}

	async function countActiveOrgs(tenantId: string): Promise<number> {
		const count = await sequelize.models.org.count({
			where: {
				tenantId,
				status: "active",
			},
		});
		return count;
	}

	async function deleteTenant(id: string): Promise<boolean> {
		const deleted = await Tenants.destroy({ where: { id } });
		return deleted > 0;
	}

	return {
		listTenants,
		getTenant,
		getTenantBySlug,
		getTenantsByProviderId,
		createTenant,
		updateTenant,
		updateTenantStatus,
		markProvisioned,
		archiveTenant,
		activateTenant,
		countActiveOrgs,
		deleteTenant,
	};
}
