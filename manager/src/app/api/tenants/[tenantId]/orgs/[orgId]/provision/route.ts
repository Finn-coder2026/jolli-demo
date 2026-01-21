import { env } from "../../../../../../../lib/Config";
import { getDatabase } from "../../../../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../../../../lib/providers";
import type { DatabaseCredentials } from "../../../../../../../lib/types";
import { bootstrapDatabaseWithSuperuser } from "../../../../../../../lib/util/BootstrapUtil";
import { getLog } from "../../../../../../../lib/util/Logger";
import { decryptPassword, isEncryptedPassword } from "jolli-common/server";
import { NextResponse } from "next/server";

const log = getLog(import.meta.url);

interface RouteParams {
	params: Promise<{ tenantId: string; orgId: string }>;
}

/**
 * POST /api/tenants/[tenantId]/orgs/[orgId]/provision - Provision the schema for an org
 *
 * This endpoint:
 * 1. Creates the PostgreSQL schema for the org
 * 2. Bootstraps the database by calling the backend (creates vector extension, runs migrations)
 * 3. Marks the org as active
 *
 * The bootstrap step requires temporarily granting superuser privileges to the tenant user
 * because PostgreSQL's pgvector extension requires superuser to install.
 */
export async function POST(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId, orgId } = await params;
		const db = await getDatabase();

		// Get the tenant
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Tenant must be active (database must exist)
		if (tenant.status !== "active") {
			return NextResponse.json(
				{ error: `Tenant is in '${tenant.status}' state, cannot provision org schema` },
				{ status: 400 },
			);
		}

		// Get the org
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Check org is in provisioning state
		if (org.status !== "provisioning") {
			return NextResponse.json(
				{ error: `Org is in '${org.status}' state, cannot provision schema` },
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
				{ error: `Provider is in '${provider.status}' state, cannot provision org schema` },
				{ status: 400 },
			);
		}

		if (!provider.databaseHost || !provider.databasePasswordEncrypted) {
			return NextResponse.json({ error: "Provider database not configured" }, { status: 400 });
		}

		// Create the provider adapter
		const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);

		// Build credentials from provider, decrypting password if encrypted
		const password =
			env.ENCRYPTION_KEY && isEncryptedPassword(provider.databasePasswordEncrypted)
				? decryptPassword(provider.databasePasswordEncrypted, env.ENCRYPTION_KEY)
				: provider.databasePasswordEncrypted;

		const credentials: DatabaseCredentials = {
			host: provider.databaseHost,
			port: provider.databasePort,
			database: provider.databaseName ?? "",
			username: provider.databaseUsername ?? "",
			password,
			ssl: provider.databaseSsl,
		};

		// Step 1: Provision the schema
		log.info("Provisioning schema %s for org %s", org.schemaName, orgId);
		await adapter.provisionSchema(credentials, org.schemaName);

		// Step 2: Bootstrap the database (if backend URL and secret are configured)
		if (env.BACKEND_INTERNAL_URL && env.BOOTSTRAP_SECRET) {
			log.info("Bootstrapping database for tenant %s, org %s", tenantId, orgId);
			try {
				await bootstrapDatabaseWithSuperuser({
					tenantId,
					orgId,
					username: credentials.username,
					providerType: provider.type,
					credentials,
				});
			} catch (bootstrapError) {
				// Bootstrap is required when configured - it creates the vector extension with superuser privileges
				log.error({ err: bootstrapError }, "Bootstrap failed for org %s - provisioning aborted", orgId);
				return NextResponse.json(
					{
						error: `Bootstrap failed: ${bootstrapError instanceof Error ? bootstrapError.message : "Unknown error"}. Ensure the backend is running and accessible.`,
					},
					{ status: 503 },
				);
			}
		} else {
			log.warn(
				"BACKEND_INTERNAL_URL or BOOTSTRAP_SECRET not configured, skipping database bootstrap. " +
					"The backend will need to create the vector extension and run migrations on first access.",
			);
		}

		// Step 3: Mark org as active
		await db.orgDao.updateOrgStatus(orgId, "active");

		return NextResponse.json({
			success: true,
			message: `Schema '${org.schemaName}' provisioned successfully`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		log.error({ err: error }, "Error provisioning org schema");
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
