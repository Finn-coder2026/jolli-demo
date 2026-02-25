import { createAuthClient } from "better-auth/react";

/**
 * Better-auth client for frontend authentication
 * Provides hooks and methods for sign in, sign up, sign out, etc.
 *
 * Configuration:
 * - baseURL: The origin where better-auth is hosted (auth.jolli-local.me or current origin)
 * - basePath: Must match the Express router mount point (/auth)
 */
export const authClient = createAuthClient({
	baseURL: window.location.origin,
	basePath: "/auth",
});

// Export commonly used methods
export const { signIn, signUp, signOut, useSession } = authClient;
