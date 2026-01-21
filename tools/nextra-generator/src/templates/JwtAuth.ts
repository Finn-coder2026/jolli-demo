import type { TemplateFile } from "../types.js";

/**
 * Generates the middleware.ts file for JWT authentication.
 * This middleware runs on every request and:
 * - Checks for JWT token in cookie
 * - Validates the token signature using the public key
 * - Redirects to login URL if token is missing or invalid
 */
export function generateJwtMiddleware(): TemplateFile {
	return {
		path: "middleware.ts",
		content: `import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';

export async function middleware(request: NextRequest) {
  // Check if JWT auth is enabled via env var (set by Jolli when toggling auth)
  const isAuthEnabled = process.env.JWT_AUTH_ENABLED === 'true';
  if (!isAuthEnabled) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  // Skip Next.js internals and auth callback only - protect all other content
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth/callback') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icon')
  ) {
    return NextResponse.next();
  }

  const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
  const LOGIN_URL = process.env.JWT_LOGIN_URL;

  // If auth is enabled but keys aren't configured, allow access (misconfiguration)
  if (!PUBLIC_KEY || !LOGIN_URL) {
    console.warn('JWT auth enabled but JWT_PUBLIC_KEY or JWT_LOGIN_URL not set');
    return NextResponse.next();
  }

  // Check for JWT in cookie
  const token = request.cookies.get('jwt_token')?.value;

  if (!token) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(pathname);
    return NextResponse.redirect(\`\${LOGIN_URL}?returnUrl=\${returnUrl}\`);
  }

  try {
    // Verify JWT signature
    const key = await importSPKI(PUBLIC_KEY.replace(/\\\\n/g, '\\n'), 'ES256');
    const { payload } = await jwtVerify(token, key);

    // Add user info to headers for downstream use
    const response = NextResponse.next();
    response.headers.set('x-user-email', payload.email as string || '');
    response.headers.set('x-user-groups', JSON.stringify(payload.groups || []));
    return response;
  } catch {
    // Invalid token - redirect to login
    const returnUrl = encodeURIComponent(pathname);
    return NextResponse.redirect(\`\${LOGIN_URL}?returnUrl=\${returnUrl}\`);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
`,
	};
}

/**
 * Generates the auth callback page that extracts JWT from URL hash.
 * This page:
 * - Extracts JWT from URL hash (#jwt=...)
 * - Stores it in a cookie for the middleware
 * - Redirects to the intended page
 */
export function generateJwtAuthCallback(): TemplateFile {
	return {
		path: "app/auth/callback/page.tsx",
		content: `'use client';

import { useEffect } from 'react';

export default function AuthCallback() {
  useEffect(() => {
    // Extract JWT from URL hash
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    const jwt = params.get('jwt');
    const returnUrl = params.get('returnUrl') || '/';
    // Sanitize returnUrl to prevent open redirect attacks
    const safeReturnUrl = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';

    const error = params.get('error');
    if (error) {
      // Show error message - user is not authorized
      document.getElementById('auth-message')!.textContent =
        'Access denied: You are not authorized to view this site.';
      return;
    }

    if (jwt) {
      // Store JWT in cookie for middleware (24 hour expiry)
      document.cookie = \`jwt_token=\${jwt}; path=/; max-age=86400; SameSite=Lax; Secure\`;
      // Use window.location for hard navigation to avoid Next.js router fetch issues
      window.location.href = safeReturnUrl;
    } else {
      // No JWT - redirect to home
      window.location.href = '/';
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div id="auth-message">Authenticating...</div>
    </div>
  );
}
`,
	};
}

/**
 * Generates the auth library with utilities for accessing user info.
 * Provides:
 * - getAuthUser() - Server-side function to get user from JWT cookie
 * - hasAccess() - Check if user has required groups
 */
export function generateJwtAuthLib(): TemplateFile {
	return {
		path: "lib/auth.ts",
		content: `import { cookies } from 'next/headers';
import { jwtVerify, importSPKI } from 'jose';

export interface AuthUser {
  email: string;
  groups: Array<string>;
  siteId: string;
  userId: string;
}

/**
 * Gets the authenticated user from the JWT cookie.
 * Returns null if no valid token is present.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('jwt_token')?.value;

  if (!token) return null;

  try {
    const publicKey = process.env.JWT_PUBLIC_KEY!.replace(/\\\\n/g, '\\n');
    const key = await importSPKI(publicKey, 'ES256');
    const { payload } = await jwtVerify(token, key);

    return {
      email: payload.email as string,
      groups: (payload.groups as Array<string>) || [],
      siteId: payload.siteId as string,
      userId: payload.sub as string,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if a user has access based on required groups.
 * Returns true if:
 * - User is authenticated AND
 * - No groups required, OR user has at least one required group
 */
export function hasAccess(user: AuthUser | null, requiredGroups?: Array<string>): boolean {
  if (!user) return false;
  if (!requiredGroups || requiredGroups.length === 0) return true;
  return requiredGroups.some(g => user.groups.includes(g));
}
`,
	};
}
