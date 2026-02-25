import { type NextRequest, NextResponse } from "next/server";
import { getOAuthService } from "@/lib/auth";
import { getCallbackBaseUrl } from "@/lib/auth/UrlUtils";

/**
 * POST /api/auth/login
 * Initiates OAuth login flow by returning the authorization URL.
 */
export function POST(request: NextRequest): NextResponse {
	const oauthService = getOAuthService();

	if (!oauthService.isConfigured()) {
		return NextResponse.json({ error: "OAuth is not configured" }, { status: 503 });
	}

	// Build callback URL using proper base URL (respects ADMIN_DOMAIN and Host header)
	const baseUrl = getCallbackBaseUrl(request);
	const callbackUrl = `${baseUrl}/api/auth/callback`;

	try {
		const authorizationUrl = oauthService.getAuthorizationUrl(callbackUrl);
		return NextResponse.json({ redirectUrl: authorizationUrl });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

/**
 * GET /api/auth/login
 * Returns auth configuration status.
 */
export function GET(): NextResponse {
	const oauthService = getOAuthService();

	return NextResponse.json({
		configured: oauthService.isConfigured(),
		provider: "google",
	});
}
