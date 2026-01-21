import { getDatabase } from "../../../../../lib/db/getDatabase";
import { getLog } from "../../../../../lib/util/Logger";
import { NextResponse } from "next/server";

const log = getLog(import.meta.url);

interface RouteParams {
	params: Promise<{ tenantId: string }>;
}

/**
 * POST /api/tenants/[tenantId]/reset - Reset a tenant back to provisioning state
 * This allows retrying provisioning for a tenant that failed
 */
export async function POST(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId } = await params;
		const db = await getDatabase();

		// Get the tenant
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		// Reset to provisioning state
		await db.tenantDao.updateTenantStatus(tenantId, "provisioning");

		return NextResponse.json({
			success: true,
			message: "Tenant reset to provisioning state. You can now retry provisioning.",
		});
	} catch (error) {
		log.error({ err: error }, "Failed to reset tenant");
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
