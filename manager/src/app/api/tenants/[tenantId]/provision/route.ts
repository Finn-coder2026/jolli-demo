import { env } from "../../../../../lib/Config";
import type { Database } from "../../../../../lib/db/Database";
import { getDatabase } from "../../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../../lib/providers";
import type { DatabaseCredentials, OrgSummary, ProviderType } from "../../../../../lib/types";
import { bootstrapDatabaseWithSuperuser, type OwnerUserInfo } from "../../../../../lib/util/BootstrapUtil";
import { getLog } from "../../../../../lib/util/Logger";
import { decryptPassword } from "jolli-common/server";
import { NextResponse } from "next/server";

const log = getLog(import.meta.url);

interface RouteParams {
	params: Promise<{ tenantId: string }>;
}

interface BootstrapContext {
	db: Database;
	tenantId: string;
	org: OrgSummary;
	credentials: DatabaseCredentials;
	providerType: ProviderType;
}

/**
 * Look up the owner user for an org and bootstrap the database if configured.
 */
async function bootstrapOrgIfConfigured(ctx: BootstrapContext): Promise<void> {
	const { db, tenantId, org, credentials, providerType } = ctx;

	if (!env.BACKEND_INTERNAL_URL || !env.BOOTSTRAP_SECRET) {
		log.warn(
			"BACKEND_INTERNAL_URL or BOOTSTRAP_SECRET not configured, skipping database bootstrap. " +
				"The backend will need to create the vector extension and run migrations on first access.",
		);
		return;
	}

	log.info("Bootstrapping database for tenant %s, org %s", tenantId, org.id);

	// Look up owner user for this org to pass to bootstrap
	let ownerUser: OwnerUserInfo | undefined;
	const ownerUserOrg = await db.userOrgDao.findOwnerByOrg(tenantId, org.id);
	if (ownerUserOrg) {
		const globalUser = await db.globalUserDao.findById(ownerUserOrg.userId);
		if (globalUser) {
			ownerUser = {
				id: globalUser.id,
				email: globalUser.email,
				name: globalUser.name,
			};
			log.info("Found owner user %d for org %s", globalUser.id, org.id);
		}
	}

	const bootstrapOptions = {
		tenantId,
		orgId: org.id,
		username: credentials.username,
		providerType,
		credentials,
		...(ownerUser ? { ownerUser } : {}),
	};
	await bootstrapDatabaseWithSuperuser(bootstrapOptions);
}

/**
 * Build a summary message for the provisioning result.
 */
function buildResultMessage(orgsProvisioned: number, orgsReused: number): string {
	const messageParts = [];
	if (orgsProvisioned > 0) {
		messageParts.push(`${orgsProvisioned} organization(s) provisioned`);
	}
	if (orgsReused > 0) {
		messageParts.push(`${orgsReused} organization(s) reused existing schema`);
	}
	return messageParts.length > 0
		? `Tenant schemas ready. ${messageParts.join(", ")}.`
		: "Tenant schemas ready. No organizations needed provisioning.";
}

/**
 * POST /api/tenants/[tenantId]/provision
 * Provision schemas for a tenant in the provider's database.
 *
 * With the new architecture, the database is created when the Provider is created.
 * Tenant provisioning only creates PostgreSQL schemas for the tenant's orgs within
 * the provider's database.
 *
 * Query parameters:
 * - reuseExisting: If true, reuse existing schema if found (skip creation and bootstrap)
 * - force: If true, drop existing schema and recreate (destroys data)
 */
export async function POST(request: Request, { params }: RouteParams) {
	try {
		const { tenantId } = await params;
		const { searchParams } = new URL(request.url);
		const reuseExisting = searchParams.get("reuseExisting") === "true";
		const force = searchParams.get("force") === "true";

		log.info("Provisioning tenant %s (reuseExisting: %s, force: %s)", tenantId, reuseExisting, force);

		const db = await getDatabase();

		// Get the tenant
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check tenant is in provisioning state
		if (tenant.status !== "provisioning") {
			return NextResponse.json(
				{ error: `Tenant is in '${tenant.status}' state, cannot provision` },
				{ status: 400 },
			);
		}

		// Get the provider (which holds the database credentials)
		const provider = await db.providerDao.getProvider(tenant.databaseProviderId);
		if (!provider) {
			return NextResponse.json({ error: "Database provider not found" }, { status: 500 });
		}

		// Ensure provider is active and has credentials
		if (provider.status !== "active") {
			return NextResponse.json(
				{ error: `Provider is in '${provider.status}' state, cannot provision tenant` },
				{ status: 400 },
			);
		}

		if (!provider.databaseHost || !provider.databasePasswordEncrypted) {
			return NextResponse.json(
				{ error: "Provider database not configured. Please provision the provider first." },
				{ status: 400 },
			);
		}

		// Decrypt provider credentials
		let password = provider.databasePasswordEncrypted;
		if (env.ENCRYPTION_KEY) {
			password = decryptPassword(provider.databasePasswordEncrypted, env.ENCRYPTION_KEY);
		}

		const credentials: DatabaseCredentials = {
			host: provider.databaseHost,
			port: provider.databasePort,
			database: provider.databaseName ?? "",
			username: provider.databaseUsername ?? "",
			password,
			ssl: provider.databaseSsl,
		};

		// Create the provider adapter for schema operations
		const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);

		// Provision all org schemas and mark them as active
		const orgs = await db.orgDao.listOrgs(tenantId);
		let orgsProvisioned = 0;
		let orgsReused = 0;

		for (const org of orgs) {
			if (org.status === "provisioning") {
				// Check if schema exists (before provisioning)
				const schemaExists = await adapter.checkSchemaExists(credentials, org.schemaName);

				// If schema exists and neither reuseExisting nor force is set, return 409 conflict
				if (schemaExists && !reuseExisting && !force) {
					log.warn("Schema %s already exists, returning 409 conflict", org.schemaName);
					return NextResponse.json(
						{
							error: `Schema '${org.schemaName}' already exists. Choose to reuse or recreate.`,
							schemaExists: true,
							schemas: [org.schemaName],
						},
						{ status: 409 },
					);
				}

				// Provision the schema for this org
				log.info("Provisioning schema %s for org %s (tenant %s)", org.schemaName, org.id, tenantId);
				const result = await adapter.provisionSchema(credentials, org.schemaName, {
					reuseExisting,
					force,
				});

				// Only bootstrap if schema was newly created (or force recreated)
				const needsBootstrap = result.created || force;
				if (needsBootstrap) {
					await bootstrapOrgIfConfigured({
						db,
						tenantId,
						org,
						credentials,
						providerType: provider.type,
					});
					orgsProvisioned++;
				} else {
					log.info("Reusing existing schema %s for org %s, skipping bootstrap", org.schemaName, org.id);
					orgsReused++;
				}

				// Mark org as active (provisioned)
				await db.orgDao.updateOrgStatus(org.id, "active");
			}
		}

		// Mark tenant as provisioned
		await db.tenantDao.markProvisioned(tenantId);

		return NextResponse.json({
			success: true,
			message: buildResultMessage(orgsProvisioned, orgsReused),
			orgsProvisioned,
			orgsReused,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error provisioning tenant");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
