import { env } from "../Config";
import { getLog } from "../util/Logger";

const log = getLog(import.meta.url);

/** Google OAuth endpoints */
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** OAuth user info returned from provider */
export interface OAuthUserInfo {
	email: string;
	name: string;
	picture: string | null;
	providerId: string;
}

/** State stored during OAuth flow */
interface OAuthState {
	redirectUri: string;
	timestamp: number;
}

/** In-memory state store for OAuth CSRF protection */
const stateStore = new Map<string, OAuthState>();

/** Clean up expired states (older than 10 minutes) */
function cleanupExpiredStates(): void {
	const now = Date.now();
	const maxAge = 10 * 60 * 1000; // 10 minutes

	for (const [state, data] of stateStore.entries()) {
		if (now - data.timestamp > maxAge) {
			stateStore.delete(state);
		}
	}
}

/** Generate a random state string for CSRF protection */
function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

export interface OAuthService {
	/**
	 * Check if OAuth is configured.
	 */
	isConfigured(): boolean;

	/**
	 * Generate the OAuth authorization URL for Google.
	 */
	getAuthorizationUrl(callbackUrl: string): string;

	/**
	 * Handle the OAuth callback and exchange code for user info.
	 */
	handleCallback(code: string, state: string, callbackUrl: string): Promise<OAuthUserInfo>;

	/**
	 * Validate that an email matches the admin email pattern.
	 */
	isEmailAllowed(email: string): boolean;
}

/**
 * Create an OAuthService instance for Google OAuth.
 */
export function createOAuthService(): OAuthService {
	function isConfigured(): boolean {
		return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
	}

	function getAuthorizationUrl(callbackUrl: string): string {
		if (!env.GOOGLE_CLIENT_ID) {
			throw new Error("GOOGLE_CLIENT_ID is not configured");
		}

		// Clean up old states
		cleanupExpiredStates();

		// Generate and store state for CSRF protection
		const state = generateState();
		stateStore.set(state, {
			redirectUri: callbackUrl,
			timestamp: Date.now(),
		});

		const params = new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID,
			redirect_uri: callbackUrl,
			response_type: "code",
			scope: "openid email profile",
			state,
			access_type: "offline",
			prompt: "consent",
		});

		return `${GOOGLE_AUTH_URL}?${params.toString()}`;
	}

	async function handleCallback(code: string, state: string, callbackUrl: string): Promise<OAuthUserInfo> {
		if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
			throw new Error("Google OAuth is not configured");
		}

		// Validate state for CSRF protection
		const storedState = stateStore.get(state);
		if (!storedState) {
			throw new Error("Invalid or expired OAuth state");
		}
		stateStore.delete(state);

		// Exchange code for tokens
		const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: env.GOOGLE_CLIENT_ID,
				client_secret: env.GOOGLE_CLIENT_SECRET,
				code,
				grant_type: "authorization_code",
				redirect_uri: callbackUrl,
			}),
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			log.error("Failed to exchange code for token: %s", errorText);
			throw new Error("Failed to exchange authorization code for token");
		}

		const tokenData = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token?: string;
			expires_in: number;
		};

		// Fetch user info
		const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
			},
		});

		if (!userInfoResponse.ok) {
			const errorText = await userInfoResponse.text();
			log.error("Failed to fetch user info: %s", errorText);
			throw new Error("Failed to fetch user information from Google");
		}

		const userInfo = (await userInfoResponse.json()) as {
			id: string;
			email: string;
			name: string;
			picture?: string;
		};

		log.info("OAuth callback successful for user: %s", userInfo.email);

		return {
			email: userInfo.email,
			name: userInfo.name,
			picture: userInfo.picture ?? null,
			providerId: userInfo.id,
		};
	}

	function isEmailAllowed(email: string): boolean {
		const pattern = env.ADMIN_EMAIL_PATTERN;
		if (!pattern) {
			return true;
		}

		try {
			const regex = new RegExp(pattern);
			return regex.test(email);
		} catch {
			log.warn("Invalid ADMIN_EMAIL_PATTERN: %s", pattern);
			return false;
		}
	}

	return {
		isConfigured,
		getAuthorizationUrl,
		handleCallback,
		isEmailAllowed,
	};
}

/** Singleton OAuth service instance */
let oauthServiceInstance: OAuthService | null = null;

/**
 * Get the singleton OAuthService instance.
 */
export function getOAuthService(): OAuthService {
	if (!oauthServiceInstance) {
		oauthServiceInstance = createOAuthService();
	}
	return oauthServiceInstance;
}
