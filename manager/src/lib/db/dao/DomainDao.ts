import type { NewTenantDomain, SslStatus, TenantDomain } from "../../types";
import type { TenantDomainRow } from "../models";
import { defineTenantDomains, toTenantDomain } from "../models";
import { randomBytes } from "node:crypto";
import type { Sequelize } from "sequelize";

export interface DomainDao {
	listDomains(tenantId: string): Promise<Array<TenantDomain>>;
	getDomain(id: string): Promise<TenantDomain | undefined>;
	getDomainByName(domain: string): Promise<TenantDomain | undefined>;
	createDomain(domain: NewTenantDomain): Promise<TenantDomain>;
	setDomainPrimary(id: string): Promise<boolean>;
	updateSslStatus(id: string, status: SslStatus): Promise<boolean>;
	markVerified(id: string): Promise<boolean>;
	deleteDomain(id: string): Promise<boolean>;
}

export function createDomainDao(sequelize: Sequelize): DomainDao {
	const Domains = defineTenantDomains(sequelize);

	async function listDomains(tenantId: string): Promise<Array<TenantDomain>> {
		const rows = await Domains.findAll({
			where: { tenantId },
			order: [
				["isPrimary", "DESC"],
				["createdAt", "ASC"],
			],
		});
		return rows.map(row => toTenantDomain(row.dataValues));
	}

	async function getDomain(id: string): Promise<TenantDomain | undefined> {
		const row = await Domains.findByPk(id);
		return row ? toTenantDomain(row.dataValues) : undefined;
	}

	async function getDomainByName(domain: string): Promise<TenantDomain | undefined> {
		const row = await Domains.findOne({ where: { domain } });
		return row ? toTenantDomain(row.dataValues) : undefined;
	}

	async function createDomain(domain: NewTenantDomain): Promise<TenantDomain> {
		// Generate verification token
		const verificationToken = randomBytes(32).toString("hex");

		// If this is set as primary, clear other primaries for this tenant
		if (domain.isPrimary) {
			await Domains.update({ isPrimary: false }, { where: { tenantId: domain.tenantId, isPrimary: true } });
		}

		const row = await Domains.create({
			tenantId: domain.tenantId,
			domain: domain.domain.toLowerCase(),
			isPrimary: domain.isPrimary ?? false,
			sslStatus: "pending",
			verificationToken,
			verifiedAt: null,
		} as unknown as TenantDomainRow);
		return toTenantDomain(row.dataValues);
	}

	async function setDomainPrimary(id: string): Promise<boolean> {
		const row = await Domains.findByPk(id);
		if (!row) {
			return false;
		}

		// Clear other primaries for this tenant
		await Domains.update({ isPrimary: false }, { where: { tenantId: row.dataValues.tenantId, isPrimary: true } });

		await row.update({ isPrimary: true });
		return true;
	}

	async function updateSslStatus(id: string, status: SslStatus): Promise<boolean> {
		const [updated] = await Domains.update({ sslStatus: status }, { where: { id } });
		return updated > 0;
	}

	async function markVerified(id: string): Promise<boolean> {
		const [updated] = await Domains.update({ verifiedAt: new Date() }, { where: { id } });
		return updated > 0;
	}

	async function deleteDomain(id: string): Promise<boolean> {
		const deleted = await Domains.destroy({ where: { id } });
		return deleted > 0;
	}

	return {
		listDomains,
		getDomain,
		getDomainByName,
		createDomain,
		setDomainPrimary,
		updateSslStatus,
		markVerified,
		deleteDomain,
	};
}
