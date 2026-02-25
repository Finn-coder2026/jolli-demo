import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Cookie name for auth token */
const AUTH_COOKIE_NAME = "manager_auth_token";

/** Public paths that don't require authentication */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/callback"];

/** Check if a path is public (no auth required) */
function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

/** Check if authentication is configured */
function isAuthConfigured(): boolean {
	return !!process.env.TOKEN_SECRET && !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/**
 * Middleware for authentication and domain redirection.
 *
 * Functions:
 * 1. Redirect from localhost to ADMIN_DOMAIN if configured
 * 2. Validate JWT token for protected routes
 * 3. Attach user info to request headers for API routes
 */
export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// ==============================
	// 1. Handle localhost redirect
	// ==============================
	const adminDomain = process.env.ADMIN_DOMAIN;
	if (adminDomain) {
		const host = request.headers.get("host") || "";
		const hostname = host.split(":")[0];

		if (hostname === "localhost") {
			const url = new URL(request.url);
			url.hostname = adminDomain;
			const gatewayDomain = process.env.GATEWAY_DOMAIN;
			if (gatewayDomain) {
				url.protocol = "https:";
				url.port = "";
			}
			return NextResponse.redirect(url);
		}
	}

	// ==============================
	// 2. Skip auth for public paths
	// ==============================
	if (isPublicPath(pathname)) {
		return NextResponse.next();
	}

	// ==============================
	// 3. Skip auth if not configured
	// ==============================
	if (!isAuthConfigured()) {
		return NextResponse.next();
	}

	// ==============================
	// 4. Validate JWT token
	// ==============================
	const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

	if (!token) {
		// No token - redirect to login for pages, return 401 for API
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		return NextResponse.redirect(new URL("/login", request.url));
	}

	try {
		// TOKEN_SECRET is guaranteed to be set here because isAuthConfigured() already checked it
		const tokenSecret = process.env.TOKEN_SECRET as string;
		const secret = new TextEncoder().encode(tokenSecret);
		const { payload } = await jwtVerify(token, secret);

		// Extract user info from JWT payload
		const userId = payload.userId as number | undefined;
		const email = payload.email as string | undefined;
		const role = payload.role as string | undefined;

		if (!userId || !email || !role) {
			throw new Error("Invalid token payload");
		}

		// Attach user info to request headers for downstream use
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-user-id", userId.toString());
		requestHeaders.set("x-user-email", email);
		requestHeaders.set("x-user-role", role);

		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	} catch {
		// Invalid token - redirect to login for pages, return 401 for API
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Clear invalid cookie and redirect to login
		const response = NextResponse.redirect(new URL("/login", request.url));
		response.cookies.set(AUTH_COOKIE_NAME, "", { maxAge: 0 });
		return response;
	}
}

export const config = {
	// Match all paths except static files
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
