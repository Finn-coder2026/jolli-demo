import { env } from "../../../../lib/Config";
import { getDatabase } from "../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../lib/providers";
import type { DatabaseCredentials, NewTenant, Tenant, TenantStatus } from "../../../../lib/types";
import { getLog } from "../../../../lib/util/Logger";
import { decryptPassword, isEncryptedPassword } from "jolli-common/server";
import { type NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, getUserFromRequest, isSuperAdmin, unauthorizedResponse } from "@/lib/auth";

const log = getLog(import.meta.url);

interface RouteParams {
	params: Promise<{ tenantId: string }>;
}

interface SchemaDropResult {
	orgId: string;
	schemaName: string;
	success: boolean;
	error?: string;
}

interface DeprovisionResult {
	attempted: number;
	succeeded: number;
	failed: number;
	skipped: number;
	results: Array<SchemaDropResult>;
	providerMissing: boolean;
	credentialsMissing: boolean;
}

/**
 * Deprovision all org schemas for a tenant.
 * Only called during hard delete when the tenant has provisioned orgs.
 * The database itself is NOT deleted (it belongs to the provider and is shared).
 *
 * @param tenant - The tenant whose schemas should be dropped
 * @returns Detailed results of the deprovisioning operation
 */
async function deprovisionTenantSchemas(tenant: Tenant): Promise<DeprovisionResult> {
	log.info("Starting schema deprovisioning for tenant %s", tenant.id);

	const db = await getDatabase();
	const provider = await db.providerDao.getProvider(tenant.databaseProviderId);

	// Check if provider exists and has required credentials
	if (!provider) {
		log.warn("Provider not found for tenant %s (providerId: %s)", tenant.id, tenant.databaseProviderId);
		return {
			attempted: 0,
			succeeded: 0,
			failed: 0,
			skipped: 0,
			results: [],
			providerMissing: true,
			credentialsMissing: false,
		};
	}

	if (!provider.databaseHost || !provider.databasePasswordEncrypted) {
		log.warn(
			"Provider %s missing credentials (host: %s, hasPassword: %s)",
			provider.id,
			!!provider.databaseHost,
			!!provider.databasePasswordEncrypted,
		);
		return {
			attempted: 0,
			succeeded: 0,
			failed: 0,
			skipped: 0,
			results: [],
			providerMissing: false,
			credentialsMissing: true,
		};
	}

	const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);
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

	// Deprovision all org schemas for this tenant (regardless of status)
	const orgs = await db.orgDao.listOrgs(tenant.id);
	log.info("Found %d orgs for tenant %s", orgs.length, tenant.id);

	const results: Array<SchemaDropResult> = [];
	let succeeded = 0;
	let failed = 0;
	const skipped = 0;

	for (const org of orgs) {
		log.info("Dropping schema %s for org %s (status: %s)", org.schemaName, org.id, org.status);
		try {
			await adapter.deprovisionSchema(credentials, org.schemaName, "drop");
			log.info("Successfully dropped schema %s", org.schemaName);
			results.push({ orgId: org.id, schemaName: org.schemaName, success: true });
			succeeded++;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error("Failed to drop schema %s: %s", org.schemaName, errorMessage);
			results.push({ orgId: org.id, schemaName: org.schemaName, success: false, error: errorMessage });
			failed++;
		}
	}

	log.info(
		"Schema deprovisioning complete for tenant %s: %d succeeded, %d failed, %d skipped",
		tenant.id,
		succeeded,
		failed,
		skipped,
	);

	return {
		attempted: succeeded + failed,
		succeeded,
		failed,
		skipped,
		results,
		providerMissing: false,
		credentialsMissing: false,
	};
}

/**
 * GET /api/tenants/[tenantId] - Get a specific tenant
 * Requires: Authenticated (SuperAdmin or User with read-only access)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}

	try {
		const { tenantId } = await params;
		const db = await getDatabase();
		const tenant = await db.tenantDao.getTenant(tenantId);

		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		return NextResponse.json({ tenant });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * PUT /api/tenants/[tenantId] - Update a tenant
 * If status is being changed to 'active', also activates all archived orgs
 * Requires: SuperAdmin
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}
	try {
		const { tenantId } = await params;
		const body = (await request.json()) as Partial<NewTenant> & { status?: TenantStatus };

		const db = await getDatabase();

		// If activating a tenant, also activate all its archived orgs
		if (body.status === "active") {
			const orgs = await db.orgDao.listOrgs(tenantId);
			for (const org of orgs) {
				if (org.status === "archived") {
					await db.orgDao.activateOrg(org.id);
				}
			}
		}

		const tenant = await db.tenantDao.updateTenant(tenantId, body);

		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		return NextResponse.json({ tenant });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/tenants/[tenantId]?mode=<mode>&confirm=<slug>
 * Delete or archive a tenant with three modes:
 * - archive: Set status to 'archived', keep everything (no confirmation needed)
 * - soft: Remove from registry but keep database schemas (requires confirmation)
 * - hard: Delete from registry and drop org schemas (requires confirmation)
 * Requires: SuperAdmin
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
	const user = getUserFromRequest(request);
	if (!user) {
		return unauthorizedResponse();
	}
	if (!isSuperAdmin(user.role)) {
		return forbiddenResponse("SuperAdmin access required");
	}
	try {
		const { tenantId } = await params;
		const { searchParams } = new URL(request.url);
		const mode = searchParams.get("mode");
		const confirm = searchParams.get("confirm");

		// Validate mode parameter is provided
		if (!mode || !["archive", "soft", "hard"].includes(mode)) {
			return NextResponse.json(
				{ error: "Missing or invalid 'mode' parameter. Must be one of: archive, soft, hard" },
				{ status: 400 },
			);
		}

		// Check if hard delete is allowed
		if (mode === "hard" && !env.ALLOW_HARD_DELETE) {
			return NextResponse.json(
				{ error: "Hard delete is not allowed. Please use archive or soft delete instead." },
				{ status: 403 },
			);
		}

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// For soft/hard modes, require confirmation
		if ((mode === "soft" || mode === "hard") && confirm !== tenant.slug) {
			return NextResponse.json(
				{
					error: `To confirm deletion, you must provide the tenant slug '${tenant.slug}' in the confirm parameter`,
				},
				{ status: 400 },
			);
		}

		// Handle archive mode - archives tenant and all its orgs
		if (mode === "archive") {
			// Archive all orgs first
			const orgs = await db.orgDao.listOrgs(tenantId);
			for (const org of orgs) {
				await db.orgDao.archiveOrg(org.id);
			}

			// Then archive the tenant
			const archived = await db.tenantDao.archiveTenant(tenantId);
			if (!archived) {
				return NextResponse.json({ error: "Failed to archive tenant" }, { status: 500 });
			}
			return NextResponse.json({
				success: true,
				message: `Tenant and ${orgs.length} organization(s) archived successfully. Use PUT /api/tenants/:id with status='active' to restore.`,
			});
		}

		// Handle soft delete mode - removes from registry but keeps database schemas
		if (mode === "soft") {
			// First, count orgs and delete all orgs for this tenant from registry
			const orgs = await db.orgDao.listOrgs(tenantId);
			await db.orgDao.deleteOrgsByTenant(tenantId);

			// Then delete the tenant from registry
			const deleted = await db.tenantDao.deleteTenant(tenantId);
			if (!deleted) {
				return NextResponse.json({ error: "Failed to delete tenant" }, { status: 500 });
			}
			return NextResponse.json({
				success: true,
				message: `Tenant and ${orgs.length} organization(s) removed from registry. Schemas have been retained.`,
			});
		}

		// Handle hard delete mode
		if (mode === "hard") {
			log.info("Hard delete requested for tenant %s (status: %s)", tenantId, tenant.status);

			// Always attempt to deprovision schemas (regardless of tenant status)
			const deprovisionResult = await deprovisionTenantSchemas(tenant);

			// If provider or credentials are missing, we can still proceed with registry deletion
			// but warn the user that schemas may be orphaned
			if (deprovisionResult.providerMissing) {
				log.warn("Provider missing for tenant %s - proceeding with registry deletion only", tenantId);
			} else if (deprovisionResult.credentialsMissing) {
				log.warn("Credentials missing for tenant %s - proceeding with registry deletion only", tenantId);
			}

			// If any schema drops failed, abort and don't delete registry entries
			if (deprovisionResult.failed > 0) {
				const failedSchemas = deprovisionResult.results
					.filter(r => !r.success)
					.map(r => ({ schema: r.schemaName, error: r.error }));

				log.error(
					"Hard delete aborted for tenant %s: %d schema(s) failed to drop",
					tenantId,
					deprovisionResult.failed,
				);

				return NextResponse.json(
					{
						success: false,
						error: `Failed to drop ${deprovisionResult.failed} schema(s). Registry NOT deleted.`,
						details: {
							schemasAttempted: deprovisionResult.attempted,
							schemasDropped: deprovisionResult.succeeded,
							schemasFailed: deprovisionResult.failed,
							schemasSkipped: deprovisionResult.skipped,
							failedSchemas,
						},
					},
					{ status: 500 },
				);
			}

			// All schemas dropped successfully (or were skipped), proceed with registry deletion
			log.info("All schemas dropped for tenant %s, deleting registry entries", tenantId);

			// Delete all orgs for this tenant (cascade)
			await db.orgDao.deleteOrgsByTenant(tenantId);

			// Delete tenant from registry
			const deleted = await db.tenantDao.deleteTenant(tenantId);
			if (!deleted) {
				return NextResponse.json({ error: "Failed to delete tenant" }, { status: 500 });
			}

			const totalOrgs = deprovisionResult.attempted + deprovisionResult.skipped;
			return NextResponse.json({
				success: true,
				message: `Tenant and ${totalOrgs} org schema(s) permanently deleted.`,
				details: {
					schemasAttempted: deprovisionResult.attempted,
					schemasDropped: deprovisionResult.succeeded,
					schemasFailed: deprovisionResult.failed,
					schemasSkipped: deprovisionResult.skipped,
				},
			});
		}

		return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
