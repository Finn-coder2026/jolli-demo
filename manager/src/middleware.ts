import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Middleware to redirect from localhost to configured ADMIN_DOMAIN.
 * This enables development with a custom domain (e.g., admin.localhost).
 * When GATEWAY_DOMAIN is also set, uses HTTPS and drops the port.
 */
export function middleware(request: NextRequest) {
	const adminDomain = process.env.ADMIN_DOMAIN;
	if (!adminDomain) {
		return NextResponse.next();
	}

	const host = request.headers.get("host") || "";
	const hostname = host.split(":")[0];

	// Redirect if on localhost but ADMIN_DOMAIN is configured
	if (hostname === "localhost") {
		const url = new URL(request.url);
		url.hostname = adminDomain;
		// When GATEWAY_DOMAIN is set, use HTTPS without port (nginx gateway mode)
		const gatewayDomain = process.env.GATEWAY_DOMAIN;
		if (gatewayDomain) {
			url.protocol = "https:";
			url.port = ""; // Use default port (443 for https)
		}
		return NextResponse.redirect(url);
	}

	return NextResponse.next();
}

export const config = {
	// Match all paths except static files and API routes
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
