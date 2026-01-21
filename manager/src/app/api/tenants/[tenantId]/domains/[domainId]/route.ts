import { getDatabase } from "../../../../../../lib/db/getDatabase";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ tenantId: string; domainId: string }>;
}

/**
 * GET /api/tenants/[tenantId]/domains/[domainId] - Get a specific domain
 */
export async function GET(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId, domainId } = await params;
		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const domain = await db.domainDao.getDomain(domainId);
		if (!domain) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Verify domain belongs to this tenant
		if (domain.tenantId !== tenantId) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		return NextResponse.json({ domain });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * PUT /api/tenants/[tenantId]/domains/[domainId] - Update a domain
 *
 * Request body:
 * - isPrimary: boolean (optional) - Set this domain as primary
 */
export async function PUT(request: Request, { params }: RouteParams) {
	try {
		const { tenantId, domainId } = await params;
		const body = (await request.json()) as { isPrimary?: boolean };

		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const domain = await db.domainDao.getDomain(domainId);
		if (!domain) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Verify domain belongs to this tenant
		if (domain.tenantId !== tenantId) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Handle isPrimary update
		if (body.isPrimary === true) {
			await db.domainDao.setDomainPrimary(domainId);
		}

		// Fetch updated domain
		const updatedDomain = await db.domainDao.getDomain(domainId);
		return NextResponse.json({ domain: updatedDomain });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * DELETE /api/tenants/[tenantId]/domains/[domainId] - Delete a domain
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId, domainId } = await params;
		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const domain = await db.domainDao.getDomain(domainId);
		if (!domain) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Verify domain belongs to this tenant
		if (domain.tenantId !== tenantId) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// TODO: If domain has active SSL, remove from provider
		// const sslProvider = getSslProvider();
		// if (domain.sslStatus === 'active' && domain.verifiedAt) {
		//   await sslProvider.removeDomain(domain.domain);
		// }

		await db.domainDao.deleteDomain(domainId);

		return NextResponse.json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
