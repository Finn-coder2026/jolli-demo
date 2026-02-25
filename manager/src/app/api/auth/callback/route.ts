import { type NextRequest, NextResponse } from "next/server";
import { getOAuthService, getSessionService, setAuthCookie } from "@/lib/auth";
import { getCallbackBaseUrl } from "@/lib/auth/UrlUtils";
import { getDatabase } from "@/lib/db/getDatabase";

/**
 * GET /api/auth/callback
 * Handles OAuth callback from Google.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");

	// Get proper base URL for all redirects (respects ADMIN_DOMAIN and Host header)
	const baseUrl = getCallbackBaseUrl(request);

	// Handle OAuth error
	if (error) {
		const errorUrl = new URL("/login", baseUrl);
		errorUrl.searchParams.set("error", error);
		return NextResponse.redirect(errorUrl);
	}

	// Validate required parameters
	if (!code || !state) {
		const errorUrl = new URL("/login", baseUrl);
		errorUrl.searchParams.set("error", "missing_params");
		return NextResponse.redirect(errorUrl);
	}

	const oauthService = getOAuthService();
	const sessionService = getSessionService();

	try {
		// Build callback URL for token exchange (must match what was sent in login request)
		const callbackUrl = `${baseUrl}/api/auth/callback`;

		// Exchange code for user info
		const userInfo = await oauthService.handleCallback(code, state, callbackUrl);

		// Check if email is allowed
		if (!oauthService.isEmailAllowed(userInfo.email)) {
			const errorUrl = new URL("/login", baseUrl);
			errorUrl.searchParams.set("error", "email_not_allowed");
			return NextResponse.redirect(errorUrl);
		}

		// Get or create user in database
		const database = await getDatabase();
		let user = await database.userDao.findByEmail(userInfo.email);

		if (!user) {
			// Check if this is the initial super admin email
			const isInitialAdmin =
				process.env.INITIAL_SUPER_ADMIN_EMAIL?.toLowerCase() === userInfo.email.toLowerCase();

			// Create new user
			user = await database.userDao.create({
				email: userInfo.email,
				name: userInfo.name,
				picture: userInfo.picture,
				role: isInitialAdmin ? "super_admin" : "user",
				isActive: true,
			});
		} else {
			// Update user info if changed
			if (user.name !== userInfo.name || user.picture !== userInfo.picture) {
				user = await database.userDao.update(user.id, {
					name: userInfo.name,
					picture: userInfo.picture,
				});
			}
		}

		if (!user) {
			throw new Error("Failed to create or update user");
		}

		// Check if user is active
		if (!user.isActive) {
			const errorUrl = new URL("/login", baseUrl);
			errorUrl.searchParams.set("error", "user_inactive");
			return NextResponse.redirect(errorUrl);
		}

		// Check or create auth record
		const auth = await database.authDao.findByProvider("google", userInfo.providerId);
		if (!auth) {
			await database.authDao.create({
				userId: user.id,
				provider: "google",
				providerId: userInfo.providerId,
				providerEmail: userInfo.email,
			});
		}

		// Create session
		const token = await sessionService.createSession({
			userId: user.id,
			email: user.email,
			role: user.role,
		});

		// Redirect to home page with auth cookie
		const response = NextResponse.redirect(new URL("/", baseUrl));
		setAuthCookie(response, token);

		return response;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("OAuth callback error:", message);

		const errorUrl = new URL("/login", baseUrl);
		errorUrl.searchParams.set("error", "auth_failed");
		return NextResponse.redirect(errorUrl);
	}
}
