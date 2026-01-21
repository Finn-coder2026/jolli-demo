import { getLog } from "./Logger";

const log = getLog(import.meta);

/**
 * Interface for OIDC token providers.
 * Implement this interface to support different cloud platforms (Vercel, Cloudflare, etc.)
 */
export interface OIDCTokenProvider {
	/**
	 * Name of the provider for logging purposes.
	 */
	readonly name: string;

	/**
	 * Checks if this provider is available in the current environment.
	 */
	isAvailable(): boolean;

	/**
	 * Gets the current OIDC token.
	 * @returns The token or undefined if not available
	 */
	getToken(): string | undefined;

	/**
	 * Extracts and stores the OIDC token from request headers.
	 * Call this early in request handling.
	 * @param headers - Request headers object (may be undefined in some environments)
	 */
	extractFromRequest(headers: Record<string, string | Array<string> | undefined> | undefined): void;
}

/**
 * Vercel OIDC token provider.
 * Extracts the token from the x-vercel-oidc-token request header.
 */
export class VercelOIDCTokenProvider implements OIDCTokenProvider {
	readonly name = "Vercel";
	private currentToken: string | undefined;

	isAvailable(): boolean {
		return process.env.VERCEL === "1";
	}

	getToken(): string | undefined {
		// First try the stored token from request header
		if (this.currentToken) {
			log.debug("Using Vercel OIDC token from request header");
			return this.currentToken;
		}

		// Fall back to environment variable (legacy or alternative injection method)
		const envToken = process.env.VERCEL_OIDC_TOKEN;
		if (envToken) {
			log.debug("Found VERCEL_OIDC_TOKEN in environment");
			return envToken;
		}

		log.debug("Vercel OIDC token not available");
		return;
	}

	extractFromRequest(headers: Record<string, string | Array<string> | undefined> | undefined): void {
		if (!headers) {
			return;
		}
		const token = headers["x-vercel-oidc-token"];
		if (Array.isArray(token)) {
			this.currentToken = token[0];
		} else {
			this.currentToken = token;
		}
		if (this.currentToken) {
			log.debug("Stored Vercel OIDC token from request header");
		}
	}

	/**
	 * Clears the stored token. Useful for testing.
	 */
	clearToken(): void {
		this.currentToken = undefined;
	}
}

/**
 * No-op OIDC token provider for environments without OIDC support.
 */
export class NoOpOIDCTokenProvider implements OIDCTokenProvider {
	readonly name = "NoOp";

	isAvailable(): boolean {
		return false;
	}

	getToken(): string | undefined {
		return;
	}

	extractFromRequest(_headers: Record<string, string | Array<string> | undefined> | undefined): void {
		// No-op
	}
}

/**
 * Global OIDC token provider instance.
 * Defaults to Vercel provider but can be replaced for other platforms.
 */
let currentProvider: OIDCTokenProvider = new VercelOIDCTokenProvider();

/**
 * Gets the current OIDC token provider.
 */
export function getOIDCTokenProvider(): OIDCTokenProvider {
	return currentProvider;
}

/**
 * Sets a custom OIDC token provider.
 * Use this to support different platforms (Cloudflare, Railway, etc.)
 */
export function setOIDCTokenProvider(provider: OIDCTokenProvider): void {
	currentProvider = provider;
	log.info({ provider: provider.name }, "Set OIDC token provider to %s", provider.name);
}

/**
 * Resets to the default Vercel provider.
 * Primarily for testing.
 */
export function resetOIDCTokenProvider(): void {
	currentProvider = new VercelOIDCTokenProvider();
}
