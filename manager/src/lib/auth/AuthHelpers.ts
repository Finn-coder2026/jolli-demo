import type { UserRole } from "../db/models";
import { getSessionService, type SessionPayload } from "./SessionService";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Cookie name for auth token */
export const AUTH_COOKIE_NAME = "manager_auth_token";

/** Cookie options for auth token */
export const AUTH_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

/** User info attached to request headers by middleware */
export interface RequestUser {
	userId: number;
	email: string;
	role: UserRole;
}

/**
 * Extract user info from request headers (set by middleware).
 */
export function getUserFromRequest(request: NextRequest): RequestUser | null {
	const userId = request.headers.get("x-user-id");
	const email = request.headers.get("x-user-email");
	const role = request.headers.get("x-user-role") as UserRole | null;

	if (!userId || !email || !role) {
		return null;
	}

	return {
		userId: Number.parseInt(userId, 10),
		email,
		role,
	};
}

/**
 * Create an unauthorized response.
 */
export function unauthorizedResponse(message = "Unauthorized"): NextResponse {
	return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Create a forbidden response.
 */
export function forbiddenResponse(message = "Forbidden"): NextResponse {
	return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Check if the user has the required role.
 * SuperAdmin has access to everything, User (read-only) only has read access.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
	if (userRole === "super_admin") {
		return true;
	}
	return userRole === requiredRole;
}

/**
 * Check if the user is a SuperAdmin.
 */
export function isSuperAdmin(userRole: UserRole): boolean {
	return userRole === "super_admin";
}

/**
 * Validate session from auth cookie.
 */
export async function validateSessionFromCookie(request: NextRequest): Promise<SessionPayload | null> {
	const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
	if (!token) {
		return null;
	}

	const sessionService = getSessionService();
	return await sessionService.validateSession(token);
}

/**
 * Set auth cookie in response.
 */
export function setAuthCookie(response: NextResponse, token: string): void {
	response.cookies.set(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
}

/**
 * Clear auth cookie in response.
 */
export function clearAuthCookie(response: NextResponse): void {
	response.cookies.set(AUTH_COOKIE_NAME, "", {
		...AUTH_COOKIE_OPTIONS,
		maxAge: 0,
	});
}

/** Type for API route handler with user (no params) */
export type AuthenticatedHandler = (request: NextRequest, user: RequestUser) => Promise<NextResponse>;

/** Type for API route handler with SuperAdmin user (no params) */
export type SuperAdminHandler = (request: NextRequest, user: RequestUser) => Promise<NextResponse>;

/**
 * Wrapper to require authentication for an API route.
 * Returns 401 if not authenticated.
 */
export function requireAuth(handler: AuthenticatedHandler): (request: NextRequest) => Promise<NextResponse> {
	return async (request: NextRequest) => {
		const user = getUserFromRequest(request);
		if (!user) {
			return unauthorizedResponse();
		}
		return await handler(request, user);
	};
}

/**
 * Wrapper to require SuperAdmin role for an API route.
 * Returns 401 if not authenticated, 403 if not SuperAdmin.
 */
export function requireSuperAdmin(handler: SuperAdminHandler): (request: NextRequest) => Promise<NextResponse> {
	return async (request: NextRequest) => {
		const user = getUserFromRequest(request);
		if (!user) {
			return unauthorizedResponse();
		}
		if (!isSuperAdmin(user.role)) {
			return forbiddenResponse("SuperAdmin access required");
		}
		return await handler(request, user);
	};
}
