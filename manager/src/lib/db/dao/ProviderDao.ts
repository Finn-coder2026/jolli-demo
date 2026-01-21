import { DEFAULT_REGION } from "../../constants/Regions";
import type { DatabaseCredentials, DatabaseProvider, NewDatabaseProvider, ProviderStatus } from "../../types";
import { generateProviderSlug } from "../../util/SlugUtils";
import type { DatabaseProviderRow } from "../models";
import { defineDatabaseProviders, toProvider } from "../models";
import type { Sequelize } from "sequelize";

export interface ProviderDao {
	listProviders(): Promise<Array<DatabaseProvider>>;
	getProvider(id: string): Promise<DatabaseProvider | undefined>;
	getProviderByName(name: string): Promise<DatabaseProvider | undefined>;
	getProviderBySlug(slug: string): Promise<DatabaseProvider | undefined>;
	getDefaultProvider(): Promise<DatabaseProvider | undefined>;
	/** Get providers for a specific region */
	getProvidersByRegion(region: string): Promise<Array<DatabaseProvider>>;
	/** Get the default provider for a specific region */
	getDefaultProviderForRegion(region: string): Promise<DatabaseProvider | undefined>;
	createProvider(provider: NewDatabaseProvider): Promise<DatabaseProvider>;
	updateProvider(id: string, updates: Partial<NewDatabaseProvider>): Promise<DatabaseProvider | undefined>;
	deleteProvider(id: string): Promise<boolean>;
	/** Set provider as default for its region (clears other defaults in the same region) */
	setDefault(id: string): Promise<boolean>;
	/** Set database credentials after provisioning */
	setProviderCredentials(id: string, credentials: DatabaseCredentials): Promise<boolean>;
	/** Mark provider as provisioned and set status to active */
	markProviderProvisioned(id: string): Promise<boolean>;
	/** Update provider status */
	updateProviderStatus(id: string, status: ProviderStatus): Promise<boolean>;
}

export function createProviderDao(sequelize: Sequelize): ProviderDao {
	const Providers = defineDatabaseProviders(sequelize);

	async function listProviders(): Promise<Array<DatabaseProvider>> {
		const rows = await Providers.findAll({ order: [["name", "ASC"]] });
		return rows.map(row => toProvider(row.dataValues));
	}

	async function getProvider(id: string): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findByPk(id);
		return row ? toProvider(row.dataValues) : undefined;
	}

	async function getProviderByName(name: string): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findOne({ where: { name } });
		return row ? toProvider(row.dataValues) : undefined;
	}

	async function getProviderBySlug(slug: string): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findOne({ where: { slug } });
		return row ? toProvider(row.dataValues) : undefined;
	}

	async function getDefaultProvider(): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findOne({ where: { isDefault: true } });
		return row ? toProvider(row.dataValues) : undefined;
	}

	async function getProvidersByRegion(region: string): Promise<Array<DatabaseProvider>> {
		const rows = await Providers.findAll({
			where: { region },
			order: [["name", "ASC"]],
		});
		return rows.map(row => toProvider(row.dataValues));
	}

	async function getDefaultProviderForRegion(region: string): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findOne({ where: { isDefault: true, region } });
		return row ? toProvider(row.dataValues) : undefined;
	}

	async function createProvider(provider: NewDatabaseProvider): Promise<DatabaseProvider> {
		const region = provider.region ?? DEFAULT_REGION;

		// If this is set as default, clear other defaults in the same region only
		if (provider.isDefault) {
			await Providers.update({ isDefault: false }, { where: { isDefault: true, region } });
		}

		// Use pre-encrypted configEncrypted if provided, otherwise stringify config
		let configValue: string | null = null;
		if (provider.configEncrypted) {
			configValue = provider.configEncrypted;
		} else if (provider.config) {
			configValue = JSON.stringify(provider.config);
		}

		// Generate slug from name if not provided
		const slug = provider.slug ?? generateProviderSlug(provider.name);

		const row = await Providers.create({
			name: provider.name,
			slug,
			type: provider.type,
			status: "pending",
			isDefault: provider.isDefault ?? false,
			region,
			configEncrypted: configValue,
			connectionTemplate: provider.connectionTemplate ?? null,
		} as unknown as DatabaseProviderRow);
		return toProvider(row.dataValues);
	}

	async function updateProvider(
		id: string,
		updates: Partial<NewDatabaseProvider>,
	): Promise<DatabaseProvider | undefined> {
		const row = await Providers.findByPk(id);
		if (!row) {
			return;
		}

		// Use the new region if provided, otherwise use the existing region
		const region = updates.region ?? row.dataValues.region;

		// If setting as default, clear other defaults in the same region only
		if (updates.isDefault) {
			await Providers.update({ isDefault: false }, { where: { isDefault: true, region } });
		}

		const updateData: Record<string, unknown> = {};
		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}
		if (updates.type !== undefined) {
			updateData.type = updates.type;
		}
		if (updates.isDefault !== undefined) {
			updateData.isDefault = updates.isDefault;
		}
		if (updates.region !== undefined) {
			updateData.region = updates.region;
		}
		// Use pre-encrypted configEncrypted if provided, otherwise stringify config
		if (updates.configEncrypted !== undefined) {
			updateData.configEncrypted = updates.configEncrypted;
		} else if (updates.config !== undefined) {
			updateData.configEncrypted = JSON.stringify(updates.config);
		}
		if (updates.connectionTemplate !== undefined) {
			updateData.connectionTemplate = updates.connectionTemplate;
		}

		await row.update(updateData);
		return toProvider(row.dataValues);
	}

	async function deleteProvider(id: string): Promise<boolean> {
		const deleted = await Providers.destroy({ where: { id } });
		return deleted > 0;
	}

	async function setDefault(id: string): Promise<boolean> {
		const row = await Providers.findByPk(id);
		if (!row) {
			return false;
		}

		const region = row.dataValues.region;

		// Clear defaults only in the same region
		await Providers.update({ isDefault: false }, { where: { isDefault: true, region } });
		await row.update({ isDefault: true });
		return true;
	}

	async function setProviderCredentials(id: string, credentials: DatabaseCredentials): Promise<boolean> {
		const row = await Providers.findByPk(id);
		if (!row) {
			return false;
		}

		await row.update({
			databaseHost: credentials.host,
			databasePort: credentials.port,
			databaseName: credentials.database,
			databaseUsername: credentials.username,
			databasePasswordEncrypted: credentials.password, // Caller should encrypt before passing
			databaseSsl: credentials.ssl,
		});
		return true;
	}

	async function markProviderProvisioned(id: string): Promise<boolean> {
		const row = await Providers.findByPk(id);
		if (!row) {
			return false;
		}

		await row.update({
			status: "active",
			provisionedAt: new Date(),
		});
		return true;
	}

	async function updateProviderStatus(id: string, status: ProviderStatus): Promise<boolean> {
		const row = await Providers.findByPk(id);
		if (!row) {
			return false;
		}

		await row.update({ status });
		return true;
	}

	return {
		listProviders,
		getProvider,
		getProviderByName,
		getProviderBySlug,
		getDefaultProvider,
		getProvidersByRegion,
		getDefaultProviderForRegion,
		createProvider,
		updateProvider,
		deleteProvider,
		setDefault,
		setProviderCredentials,
		markProviderProvisioned,
		updateProviderStatus,
	};
}
