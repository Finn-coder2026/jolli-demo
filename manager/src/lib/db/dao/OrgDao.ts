import type { NewOrg, Org, OrgStatus, OrgSummary } from "../../types";
import { slugToPostgresIdentifier } from "../../util/SlugUtils";
import type { OrgRow } from "../models";
import { defineOrgs, toOrg, toOrgSummary } from "../models";
import type { Sequelize } from "sequelize";

export interface OrgDao {
	listOrgs(tenantId: string): Promise<Array<OrgSummary>>;
	getOrg(id: string): Promise<Org | undefined>;
	getOrgBySlug(tenantId: string, slug: string): Promise<Org | undefined>;
	getDefaultOrg(tenantId: string): Promise<Org | undefined>;
	/** Create an org with schema name based on tenant slug */
	createOrg(tenantId: string, tenantSlug: string, org: NewOrg): Promise<Org>;
	updateOrg(id: string, updates: Partial<NewOrg> & { status?: OrgStatus }): Promise<Org | undefined>;
	updateOrgStatus(id: string, status: OrgStatus): Promise<boolean>;
	archiveOrg(id: string): Promise<boolean>;
	activateOrg(id: string): Promise<boolean>;
	softDeleteOrg(id: string): Promise<boolean>;
	deleteOrg(id: string): Promise<boolean>;
	deleteOrgsByTenant(tenantId: string): Promise<number>;
}

/**
 * Generate a PostgreSQL schema name for an org.
 *
 * Schema naming convention:
 * - Default org: org_{tenantSlug}
 * - Additional orgs: org_{tenantSlug}_{orgSlug}
 *
 * Slugs are sanitized to replace hyphens with underscores since PostgreSQL
 * identifiers and tools like pg-boss only allow alphanumeric characters and
 * underscores. Since tenant/org slugs don't allow underscores, this conversion
 * is collision-safe.
 *
 * This ensures schema names are unique across tenants sharing the same database.
 *
 * @param tenantSlug - The tenant's slug
 * @param orgSlug - The org's slug
 * @param isDefault - Whether this is the default org
 */
function generateSchemaName(tenantSlug: string, orgSlug: string, isDefault: boolean): string {
	const safeTenantSlug = slugToPostgresIdentifier(tenantSlug);
	const safeOrgSlug = slugToPostgresIdentifier(orgSlug);

	if (isDefault) {
		return `org_${safeTenantSlug}`;
	}
	return `org_${safeTenantSlug}_${safeOrgSlug}`;
}

export function createOrgDao(sequelize: Sequelize): OrgDao {
	const Orgs = defineOrgs(sequelize);

	async function listOrgs(tenantId: string): Promise<Array<OrgSummary>> {
		const rows = await Orgs.findAll({
			where: { tenantId },
			order: [
				["isDefault", "DESC"],
				["createdAt", "ASC"],
			],
		});
		return rows.map(row => toOrgSummary(row.dataValues));
	}

	async function getOrg(id: string): Promise<Org | undefined> {
		const row = await Orgs.findByPk(id);
		return row ? toOrg(row.dataValues) : undefined;
	}

	async function getOrgBySlug(tenantId: string, slug: string): Promise<Org | undefined> {
		const row = await Orgs.findOne({ where: { tenantId, slug } });
		return row ? toOrg(row.dataValues) : undefined;
	}

	async function getDefaultOrg(tenantId: string): Promise<Org | undefined> {
		const row = await Orgs.findOne({ where: { tenantId, isDefault: true } });
		return row ? toOrg(row.dataValues) : undefined;
	}

	async function createOrg(tenantId: string, tenantSlug: string, org: NewOrg): Promise<Org> {
		const isDefault = org.isDefault ?? false;
		const schemaName = generateSchemaName(tenantSlug, org.slug, isDefault);
		const row = await Orgs.create({
			tenantId,
			slug: org.slug,
			displayName: org.displayName,
			schemaName,
			status: "provisioning",
			isDefault,
		} as unknown as OrgRow);
		return toOrg(row.dataValues);
	}

	async function updateOrg(id: string, updates: Partial<NewOrg> & { status?: OrgStatus }): Promise<Org | undefined> {
		const row = await Orgs.findByPk(id);
		if (!row) {
			return;
		}

		const updateData: Record<string, unknown> = {};
		if (updates.displayName !== undefined) {
			updateData.displayName = updates.displayName;
		}
		if (updates.status !== undefined) {
			updateData.status = updates.status;
		}

		await row.update(updateData);
		return toOrg(row.dataValues);
	}

	async function updateOrgStatus(id: string, status: OrgStatus): Promise<boolean> {
		const [updated] = await Orgs.update({ status }, { where: { id } });
		return updated > 0;
	}

	async function archiveOrg(id: string): Promise<boolean> {
		const [updated] = await Orgs.update({ status: "archived" }, { where: { id } });
		return updated > 0;
	}

	async function activateOrg(id: string): Promise<boolean> {
		const [updated] = await Orgs.update({ status: "active" }, { where: { id } });
		return updated > 0;
	}

	async function softDeleteOrg(id: string): Promise<boolean> {
		const [updated] = await Orgs.update({ schemaRetained: true }, { where: { id } });
		if (updated === 0) {
			return false;
		}
		const deleted = await Orgs.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteOrg(id: string): Promise<boolean> {
		const deleted = await Orgs.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteOrgsByTenant(tenantId: string): Promise<number> {
		return await Orgs.destroy({ where: { tenantId } });
	}

	return {
		listOrgs,
		getOrg,
		getOrgBySlug,
		getDefaultOrg,
		createOrg,
		updateOrg,
		updateOrgStatus,
		archiveOrg,
		activateOrg,
		softDeleteOrg,
		deleteOrg,
		deleteOrgsByTenant,
	};
}
