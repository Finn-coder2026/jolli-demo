import { getDatabase } from "../../../../../lib/db/getDatabase";
import type { NewOrg } from "../../../../../lib/types";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ tenantId: string }>;
}

/**
 * GET /api/tenants/[tenantId]/orgs - List all orgs for a tenant
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId } = await params;
		const db = await getDatabase();

		// First check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const orgs = await db.orgDao.listOrgs(tenantId);
		return NextResponse.json({ orgs });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * POST /api/tenants/[tenantId]/orgs - Create a new org
 */
export async function POST(request: Request, { params }: RouteParams) {
	try {
		const { tenantId } = await params;
		const body = (await request.json()) as NewOrg;

		// Validate required fields
		if (!body.slug) {
			return NextResponse.json({ error: "slug is required" }, { status: 400 });
		}
		if (!body.displayName) {
			return NextResponse.json({ error: "displayName is required" }, { status: 400 });
		}

		// Validate slug format (lowercase alphanumeric with hyphens)
		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
			return NextResponse.json(
				{ error: "slug must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric" },
				{ status: 400 },
			);
		}

		// Prevent creating additional default orgs
		if (body.isDefault) {
			return NextResponse.json(
				{ error: "Cannot create additional default orgs. Only one default org per tenant is allowed." },
				{ status: 400 },
			);
		}

		// Prevent using reserved slug
		if (body.slug === "default") {
			return NextResponse.json({ error: "The slug 'default' is reserved for the default org." }, { status: 400 });
		}

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if org with same slug already exists for this tenant
		const existingOrg = await db.orgDao.getOrgBySlug(tenantId, body.slug);
		if (existingOrg) {
			return NextResponse.json({ error: "Org with this slug already exists for this tenant" }, { status: 409 });
		}

		// Create the org record (schema provisioning happens separately via /provision endpoint)
		// Schema name will be org_{tenantSlug}_{orgSlug}
		const org = await db.orgDao.createOrg(tenantId, tenant.slug, body);

		return NextResponse.json({ org }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
