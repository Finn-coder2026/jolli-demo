import { type NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getSessionService, getUserFromRequest } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * Logs out the current user by destroying their session and clearing the auth cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	const requestUser = getUserFromRequest(request);

	// If user is authenticated, destroy their session
	if (requestUser) {
		try {
			const sessionService = getSessionService();
			await sessionService.destroySession(requestUser.userId);
		} catch (error) {
			// Log but don't fail - we still want to clear the cookie
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error("Error destroying session:", message);
		}
	}

	// Clear auth cookie and return success
	const response = NextResponse.json({ success: true });
	clearAuthCookie(response);

	return response;
}
