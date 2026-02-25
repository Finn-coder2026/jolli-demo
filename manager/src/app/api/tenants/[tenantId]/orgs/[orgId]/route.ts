import { env } from "../../../../../../lib/Config";
import { getDatabase } from "../../../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../../../lib/providers";
import type { NewOrg } from "../../../../../../lib/types";
import { decryptPassword, isEncryptedPassword } from "jolli-common/server";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ tenantId: string; orgId: string }>;
}

/**
 * GET /api/tenants/[tenantId]/orgs/[orgId] - Get a specific org
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId, orgId } = await params;
		const db = await getDatabase();

		// First check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const org = await db.orgDao.getOrg(orgId);
		if (!org) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Ensure org belongs to the tenant
		if (org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// Look up the owner user for this org
		let ownerEmail: string | null = null;
		const ownerUserOrg = await db.userOrgDao.findOwnerByOrg(tenantId, orgId);
		if (ownerUserOrg) {
			const globalUser = await db.globalUserDao.findById(ownerUserOrg.userId);
			if (globalUser) {
				ownerEmail = globalUser.email;
			}
		}

		return NextResponse.json({ org, ownerEmail });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * PUT /api/tenants/[tenantId]/orgs/[orgId] - Update an org
 */
export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { tenantId, orgId } = await params;
		const body = (await request.json()) as Partial<NewOrg>;

		const db = await getDatabase();

		// First check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const existingOrg = await db.orgDao.getOrg(orgId);
		if (!existingOrg || existingOrg.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		const org = await db.orgDao.updateOrg(orgId, body);
		if (!org) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		return NextResponse.json({ org });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/tenants/[tenantId]/orgs/[orgId]?mode=<mode>&confirm=<slug>
 * Delete or archive an org with two modes:
 * - archive: Set status to 'archived', keep everything (no confirmation needed)
 * - hard: Delete from registry and drop schema (requires confirmation)
 * Note: Cannot delete or archive the default org (it's tied to tenant lifecycle)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
	try {
		const { tenantId, orgId } = await params;
		const { searchParams } = new URL(request.url);
		const mode = searchParams.get("mode");
		const confirm = searchParams.get("confirm");

		// Validate mode parameter is provided
		if (!mode || !["archive", "hard"].includes(mode)) {
			return NextResponse.json(
				{ error: "Missing or invalid 'mode' parameter. Must be one of: archive, hard" },
				{ status: 400 },
			);
		}

		// Check if hard delete is allowed
		if (mode === "hard" && !env.ALLOW_HARD_DELETE) {
			return NextResponse.json(
				{ error: "Hard delete is not allowed. Please use archive instead." },
				{ status: 403 },
			);
		}

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org exists and belongs to tenant
		const org = await db.orgDao.getOrg(orgId);
		if (!org || org.tenantId !== tenantId) {
			return NextResponse.json({ error: "Org not found" }, { status: 404 });
		}

		// For hard mode, require confirmation
		if (mode === "hard" && confirm !== org.slug) {
			return NextResponse.json(
				{
					error: `To confirm deletion, you must provide the org slug '${org.slug}' in the confirm parameter`,
				},
				{ status: 400 },
			);
		}

		// Default org cannot be deleted or archived - it's tied to tenant lifecycle
		if (org.isDefault) {
			return NextResponse.json(
				{
					error: "Cannot delete or archive the default org independently. Archive or delete the tenant instead.",
				},
				{ status: 400 },
			);
		}

		// Handle archive mode
		if (mode === "archive") {
			const archived = await db.orgDao.archiveOrg(orgId);
			if (!archived) {
				return NextResponse.json({ error: "Failed to archive org" }, { status: 500 });
			}
			return NextResponse.json({
				success: true,
				message:
					"Org archived successfully. Use PUT /api/tenants/:tenantId/orgs/:orgId with status='active' to restore.",
			});
		}

		// Handle hard delete mode
		if (mode === "hard") {
			// Deprovision schema if tenant is active and provider has credentials
			const provider = await db.providerDao.getProvider(tenant.databaseProviderId);
			if (tenant.status === "active" && provider?.databaseHost && provider?.databasePasswordEncrypted) {
				const adapter = await createProviderAdapter(provider, env.ADMIN_POSTGRES_URL);

				// Decrypt password if encrypted
				const password =
					env.ENCRYPTION_KEY && isEncryptedPassword(provider.databasePasswordEncrypted)
						? decryptPassword(provider.databasePasswordEncrypted, env.ENCRYPTION_KEY)
						: provider.databasePasswordEncrypted;

				await adapter.deprovisionSchema(
					{
						host: provider.databaseHost,
						port: provider.databasePort,
						database: provider.databaseName ?? "",
						username: provider.databaseUsername ?? "",
						password,
						ssl: provider.databaseSsl,
					},
					org.schemaName,
					"drop",
				);
			}

			// Delete org from registry
			const deleted = await db.orgDao.deleteOrg(orgId);
			if (!deleted) {
				return NextResponse.json({ error: "Failed to delete org" }, { status: 500 });
			}

			return NextResponse.json({
				success: true,
				message: "Org and schema permanently deleted.",
			});
		}

		return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
