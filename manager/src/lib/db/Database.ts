import { env } from "../Config";
import { DEFAULT_REGION } from "../constants/Regions";
import { createProviderAdapter } from "../providers/ProviderFactory";
import { getLog } from "../util/Logger";
import type { DomainDao, OrgDao, ProviderDao, TenantDao } from "./dao";
import { createDomainDao, createOrgDao, createProviderDao, createTenantDao } from "./dao";
import {
	defineDatabaseProviders,
	defineGitHubInstallationMappings,
	defineOrgs,
	defineTenantDomains,
	defineTenants,
} from "./models";
import { encryptPassword } from "jolli-common/server";
import type { Sequelize } from "sequelize";

/** Slug for the auto-created pre-configured provider */
export const PRECONFIGURED_PROVIDER_SLUG = "preconfigured_postgresql";

const log = getLog(import.meta.url);

export interface Database {
	tenantDao: TenantDao;
	providerDao: ProviderDao;
	domainDao: DomainDao;
	orgDao: OrgDao;
}

/**
 * Create all DAOs and sync database schema.
 */
export async function createDatabase(sequelize: Sequelize): Promise<Database> {
	// Define all models first (must be done before sync)
	defineDatabaseProviders(sequelize);
	defineTenants(sequelize);
	defineTenantDomains(sequelize);
	defineOrgs(sequelize);
	defineGitHubInstallationMappings(sequelize);

	// Sync models to database (creates tables if they don't exist)
	await sequelize.sync({ alter: true });

	const database: Database = {
		tenantDao: createTenantDao(sequelize),
		providerDao: createProviderDao(sequelize),
		domainDao: createDomainDao(sequelize),
		orgDao: createOrgDao(sequelize),
	};

	// Ensure a default provider exists
	await ensureDefaultProvider(database.providerDao);

	return database;
}

/**
 * Provision a provider by creating its database and storing credentials.
 * Returns true if provisioning succeeded, false otherwise.
 */
async function provisionProvider(providerDao: ProviderDao, provider: { id: string; slug: string }): Promise<boolean> {
	try {
		await providerDao.updateProviderStatus(provider.id, "provisioning");

		const adapter = await createProviderAdapter(
			{ type: "connection_string" } as Parameters<typeof createProviderAdapter>[0],
			env.ADMIN_POSTGRES_URL,
		);
		const result = await adapter.provisionDatabase(provider.slug, { reuseExisting: true });

		if (!result.success || !result.credentials) {
			log.error("Failed to provision provider %s: %s", provider.slug, result.error ?? "Unknown error");
			await providerDao.updateProviderStatus(provider.id, "pending");
			return false;
		}

		// Store credentials and mark as active
		const encryptedPassword = env.ENCRYPTION_KEY
			? encryptPassword(result.credentials.password, env.ENCRYPTION_KEY)
			: result.credentials.password;

		await providerDao.setProviderCredentials(provider.id, {
			...result.credentials,
			password: encryptedPassword,
		});
		await providerDao.markProviderProvisioned(provider.id);

		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error("Failed to provision provider %s: %s", provider.slug, message);
		await providerDao.updateProviderStatus(provider.id, "pending");
		return false;
	}
}

/**
 * Ensure a default provider exists and is provisioned.
 * Creates and provisions one if no providers are configured and DISABLE_DEFAULT_PROVIDER is false.
 * When DISABLE_DEFAULT_PROVIDER is true, providers must be explicitly created.
 * Also ensures at least one provider is marked as default per region.
 */
async function ensureDefaultProvider(providerDao: ProviderDao): Promise<void> {
	const providers = await providerDao.listProviders();

	if (providers.length === 0) {
		if (env.DISABLE_DEFAULT_PROVIDER) {
			log.info("No database providers configured (default provider disabled by DISABLE_DEFAULT_PROVIDER)");
			return;
		}
		log.info("No database providers configured, creating and provisioning default provider");

		const provider = await providerDao.createProvider({
			name: "Pre-Configured PostgreSQL",
			slug: PRECONFIGURED_PROVIDER_SLUG,
			type: "connection_string",
			isDefault: true,
			region: DEFAULT_REGION,
		});

		if (await provisionProvider(providerDao, provider)) {
			log.info("Default provider created and provisioned successfully");
		}
	} else {
		// Check if there's a pending preconfigured provider that needs provisioning
		const pendingProvider = providers.find(p => p.slug === PRECONFIGURED_PROVIDER_SLUG && p.status === "pending");
		if (pendingProvider && !env.DISABLE_DEFAULT_PROVIDER) {
			log.info("Found pending preconfigured provider, attempting to provision...");
			if (await provisionProvider(providerDao, pendingProvider)) {
				log.info("Pending preconfigured provider provisioned successfully");
			}
		}

		// Ensure at least one provider is marked as default per region
		const regions = [...new Set(providers.map(p => p.region))];
		for (const region of regions) {
			const regionProviders = providers.filter(p => p.region === region);
			const hasDefaultInRegion = regionProviders.some(p => p.isDefault);
			if (!hasDefaultInRegion) {
				log.info("No default provider set for region %s, marking first provider as default", region);
				await providerDao.setDefault(regionProviders[0].id);
			}
		}
	}
}
