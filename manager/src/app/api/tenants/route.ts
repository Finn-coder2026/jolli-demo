import { isReservedSubdomain } from "../../../lib/constants/ReservedSubdomains";
import { getDatabase } from "../../../lib/db/getDatabase";
import type { NewTenant } from "../../../lib/types";
import { getLog } from "../../../lib/util/Logger";
import { NextResponse } from "next/server";

const log = getLog(import.meta.url);

/**
 * GET /api/tenants - List all tenants
 */
export async function GET() {
	try {
		const db = await getDatabase();
		const tenants = await db.tenantDao.listTenants();
		return NextResponse.json({ tenants });
	} catch (error) {
		log.error({ err: error }, "Failed to list tenants");
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * POST /api/tenants - Create a new tenant
 */
export async function POST(request: Request) {
	try {
		const body = (await request.json()) as NewTenant;

		// Validate required fields
		if (!body.slug || !body.displayName) {
			return NextResponse.json({ error: "slug and displayName are required" }, { status: 400 });
		}

		// Validate slug format
		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
			return NextResponse.json(
				{ error: "slug must be lowercase alphanumeric with optional hyphens, cannot start or end with hyphen" },
				{ status: 400 },
			);
		}

		// Check for reserved subdomains
		if (isReservedSubdomain(body.slug)) {
			return NextResponse.json(
				{ error: `"${body.slug}" is a reserved subdomain and cannot be used as a tenant slug` },
				{ status: 400 },
			);
		}

		const db = await getDatabase();

		// Check if slug is already taken
		const existing = await db.tenantDao.getTenantBySlug(body.slug);
		if (existing) {
			return NextResponse.json({ error: "Tenant with this slug already exists" }, { status: 409 });
		}

		// Get default provider or specified provider
		let providerId = body.databaseProviderId;
		if (!providerId) {
			const defaultProvider = await db.providerDao.getDefaultProvider();
			if (!defaultProvider) {
				return NextResponse.json({ error: "No default database provider configured" }, { status: 400 });
			}
			providerId = defaultProvider.id;
		}

		// Note: We don't check for existing databases here anymore.
		// If a database exists from a soft-deleted tenant, it will be detected during provisioning
		// and the user will be prompted to either reuse it or drop and recreate.

		// Create the tenant (initially in "provisioning" status)
		const tenant = await db.tenantDao.createTenant(body, providerId);

		// Create the default org for this tenant (schema name will be org_{tenantSlug})
		await db.orgDao.createOrg(tenant.id, tenant.slug, {
			slug: "default",
			displayName: "Default",
			isDefault: true,
		});

		return NextResponse.json({ tenant }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
