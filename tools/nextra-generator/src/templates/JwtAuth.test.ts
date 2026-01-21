import { generateJwtAuthCallback, generateJwtAuthLib, generateJwtMiddleware } from "./JwtAuth.js";
import { describe, expect, it } from "vitest";

describe("generateJwtMiddleware", () => {
	it("should generate middleware.ts with correct path", () => {
		const result = generateJwtMiddleware();
		expect(result.path).toBe("middleware.ts");
	});

	it("should include Next.js middleware imports", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("import { NextResponse } from 'next/server'");
		expect(result.content).toContain("import type { NextRequest } from 'next/server'");
	});

	it("should include jose library imports", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("import { jwtVerify, importSPKI } from 'jose'");
	});

	it("should use environment variables for config", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("process.env.JWT_PUBLIC_KEY");
		expect(result.content).toContain("process.env.JWT_LOGIN_URL");
	});

	it("should skip Next.js internals and auth callback only", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("pathname.startsWith('/_next')");
		expect(result.content).toContain("pathname.startsWith('/auth/callback')");
		expect(result.content).toContain("pathname === '/favicon.ico'");
		expect(result.content).toContain("pathname.startsWith('/icon')");
	});

	it("should check for JWT token in cookie", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("request.cookies.get('jwt_token')");
	});

	it("should redirect to login URL when no token", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("NextResponse.redirect");
		expect(result.content).toContain("LOGIN_URL");
		expect(result.content).toContain("returnUrl");
	});

	it("should verify JWT using ES256", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("importSPKI");
		expect(result.content).toContain("ES256");
		expect(result.content).toContain("jwtVerify");
	});

	it("should set user info headers on valid token", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("response.headers.set('x-user-email'");
		expect(result.content).toContain("response.headers.set('x-user-groups'");
	});

	it("should include matcher config", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("export const config");
		expect(result.content).toContain("matcher:");
	});

	it("should export middleware function", () => {
		const result = generateJwtMiddleware();
		expect(result.content).toContain("export async function middleware");
	});
});

describe("generateJwtAuthCallback", () => {
	it("should generate callback page with correct path", () => {
		const result = generateJwtAuthCallback();
		expect(result.path).toBe("app/auth/callback/page.tsx");
	});

	it("should be a client component", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("'use client'");
	});

	it("should import React hooks", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("import { useEffect } from 'react'");
	});

	it("should extract JWT from URL hash", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("window.location.hash");
		expect(result.content).toContain("URLSearchParams");
		expect(result.content).toContain("params.get('jwt')");
	});

	it("should extract returnUrl from URL hash", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("params.get('returnUrl')");
	});

	it("should store JWT in cookie with security flags", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("document.cookie");
		expect(result.content).toContain("jwt_token");
		expect(result.content).toContain("max-age=86400");
		expect(result.content).toContain("SameSite=Lax");
		expect(result.content).toContain("Secure");
	});

	it("should redirect to sanitized returnUrl after storing token", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("window.location.href = safeReturnUrl");
	});

	it("should sanitize returnUrl to prevent open redirect attacks", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("const safeReturnUrl = returnUrl.startsWith('/')");
		expect(result.content).toContain("!returnUrl.startsWith('//')");
	});

	it("should redirect to home when no JWT", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("window.location.href = '/'");
	});

	it("should show loading state", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("Authenticating...");
	});

	it("should handle error param from URL hash", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("params.get('error')");
	});

	it("should show access denied message on error", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("Access denied");
		expect(result.content).toContain("not authorized");
	});

	it("should have an auth-message element for error display", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain('id="auth-message"');
	});

	it("should export default AuthCallback component", () => {
		const result = generateJwtAuthCallback();
		expect(result.content).toContain("export default function AuthCallback()");
	});
});

describe("generateJwtAuthLib", () => {
	it("should generate auth.ts with correct path", () => {
		const result = generateJwtAuthLib();
		expect(result.path).toBe("lib/auth.ts");
	});

	it("should import cookies from next/headers", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("import { cookies } from 'next/headers'");
	});

	it("should import jose library functions", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("import { jwtVerify, importSPKI } from 'jose'");
	});

	it("should export AuthUser interface", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("export interface AuthUser");
		expect(result.content).toContain("email: string");
		expect(result.content).toContain("groups: Array<string>");
		expect(result.content).toContain("siteId: string");
		expect(result.content).toContain("userId: string");
	});

	it("should export getAuthUser function", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("export async function getAuthUser()");
		expect(result.content).toContain("Promise<AuthUser | null>");
	});

	it("should read JWT from cookies", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("await cookies()");
		expect(result.content).toContain("cookieStore.get('jwt_token')");
	});

	it("should verify JWT using ES256", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("importSPKI(publicKey, 'ES256')");
		expect(result.content).toContain("jwtVerify(token, key)");
	});

	it("should extract user fields from payload", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("payload.email");
		expect(result.content).toContain("payload.groups");
		expect(result.content).toContain("payload.siteId");
		expect(result.content).toContain("payload.sub");
	});

	it("should return null when no token", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("if (!token) return null");
	});

	it("should return null on verification error", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("catch {");
		expect(result.content).toContain("return null");
	});

	it("should export hasAccess function", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("export function hasAccess");
		expect(result.content).toContain("user: AuthUser | null");
		expect(result.content).toContain("requiredGroups?: Array<string>");
	});

	it("should return false for null user in hasAccess", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("if (!user) return false");
	});

	it("should return true when no groups required", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("if (!requiredGroups || requiredGroups.length === 0) return true");
	});

	it("should check if user has any required group", () => {
		const result = generateJwtAuthLib();
		expect(result.content).toContain("requiredGroups.some(g => user.groups.includes(g))");
	});
});
