import { env } from "../../../lib/Config";
import { NextResponse } from "next/server";

/**
 * GET /api/config - Get public configuration values
 * Returns configuration that should be accessible to the frontend
 */
export function GET() {
	return NextResponse.json({
		allowHardDelete: env.ALLOW_HARD_DELETE,
		allowedNeonOrgIds: env.ALLOWED_NEON_ORG_IDS,
		gatewayDomain: env.GATEWAY_DOMAIN,
	});
}
