import { getLog } from "./Logger";

const log = getLog(import.meta);

/**
 * Interface for OIDC token providers.
 * Implement this interface to support different cloud platforms.
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
 * Defaults to NoOp provider. Set a custom provider if OIDC is needed.
 */
let currentProvider: OIDCTokenProvider = new NoOpOIDCTokenProvider();

/**
 * Gets the current OIDC token provider.
 */
export function getOIDCTokenProvider(): OIDCTokenProvider {
	return currentProvider;
}

/**
 * Sets a custom OIDC token provider.
 */
export function setOIDCTokenProvider(provider: OIDCTokenProvider): void {
	currentProvider = provider;
	log.info({ provider: provider.name }, "Set OIDC token provider to %s", provider.name);
}

/**
 * Resets to the default NoOp provider.
 * Primarily for testing.
 */
export function resetOIDCTokenProvider(): void {
	currentProvider = new NoOpOIDCTokenProvider();
}
