import { getDatabase } from "../../../../../lib/db/getDatabase";
import type { NewTenantDomain } from "../../../../../lib/types";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ tenantId: string }>;
}

/**
 * GET /api/tenants/[tenantId]/domains - List all domains for a tenant
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

		const domains = await db.domainDao.listDomains(tenantId);
		return NextResponse.json({ domains });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * POST /api/tenants/[tenantId]/domains - Create a new domain
 *
 * Request body:
 * - domain: string (required) - The domain name to add
 * - isPrimary: boolean (optional) - Whether this domain should be primary
 */
export async function POST(request: Request, { params }: RouteParams) {
	try {
		const { tenantId } = await params;
		const body = (await request.json()) as Partial<NewTenantDomain>;

		// Validate required fields
		if (!body.domain) {
			return NextResponse.json({ error: "domain is required" }, { status: 400 });
		}

		// Validate domain format (basic check)
		const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
		if (!domainRegex.test(body.domain)) {
			return NextResponse.json(
				{ error: "Invalid domain format. Must be a valid domain like 'docs.example.com'" },
				{ status: 400 },
			);
		}

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Check if domain is already in use (globally unique)
		const existingDomain = await db.domainDao.getDomainByName(body.domain.toLowerCase());
		if (existingDomain) {
			return NextResponse.json({ error: "This domain is already in use" }, { status: 409 });
		}

		// Create the domain record
		const domain = await db.domainDao.createDomain({
			tenantId,
			domain: body.domain,
			isPrimary: body.isPrimary ?? false,
		});

		return NextResponse.json({ domain }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
