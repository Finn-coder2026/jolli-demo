import { env } from "../Config";
import type { NextRequest } from "next/server";

/**
 * Get the base URL for OAuth callbacks and redirects.
 *
 * Priority:
 * 1. ADMIN_DOMAIN environment variable (uses HTTPS)
 * 2. Host header from request (HTTPS for non-localhost, HTTP for localhost)
 * 3. request.url origin (fallback)
 *
 * This ensures OAuth callbacks work correctly in development when using
 * custom domains (like admin.jolli-local.me) instead of localhost.
 *
 * @param request - The Next.js request object
 * @returns The base URL to use for callbacks (e.g., "https://admin.jolli-local.me")
 */
export function getCallbackBaseUrl(request: NextRequest): string {
	const adminDomain = env.ADMIN_DOMAIN;

	if (adminDomain) {
		// Use configured admin domain with HTTPS
		return `https://${adminDomain}`;
	}

	// Fall back to Host header if available
	const host = request.headers.get("host");
	if (host) {
		// Determine protocol: use HTTPS if not localhost
		const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
		const protocol = isLocalhost ? "http" : "https";
		return `${protocol}://${host}`;
	}

	// Last resort: use request.url origin
	return new URL(request.url).origin;
}
