/**
 * Type marker to ensure this module has runtime presence for coverage.
 * Without this, the module is erased by TypeScript since it only contains interfaces.
 * @internal
 */
export const CONFIG_PROVIDER_MODULE = Symbol("ConfigProvider");

/**
 * Interface for configuration providers.
 *
 * Configuration providers load environment variables from different sources
 * (AWS Parameter Store, Vercel Environment, local .env files, etc.).
 *
 * Providers are used in a chain where lower priority providers load first,
 * and higher priority providers can override values.
 */
export interface ConfigProvider {
	/**
	 * Human-readable name for this provider (used in logging).
	 */
	readonly name: string;

	/**
	 * Priority of this provider. Lower numbers = higher priority.
	 * Higher priority providers override values from lower priority ones.
	 *
	 * Recommended values:
	 * - 1: AWS Parameter Store (highest priority for prod/preview)
	 * - 2: Vercel Environment (fallback)
	 * - 3: Local .env files (lowest priority, for development)
	 */
	readonly priority: number;

	/**
	 * Check if this provider is available and should be used.
	 * For example, AWS provider checks if PSTORE_ENV is set,
	 * Vercel provider checks if VERCEL=1.
	 */
	isAvailable(): boolean;

	/**
	 * Load configuration variables from this provider's source.
	 *
	 * @returns A record of environment variable names to values.
	 *          Only returns variables that this provider knows about.
	 *          Missing or unavailable variables should not be included.
	 */
	load(): Promise<Record<string, string>>;
}

/**
 * Result of loading from multiple providers.
 */
export interface ProviderLoadResult {
	/**
	 * The provider that loaded these variables.
	 */
	providerName: string;

	/**
	 * Number of variables loaded from this provider.
	 */
	count: number;

	/**
	 * Names of variables loaded (for logging, excludes values for security).
	 */
	variableNames: Array<string>;
}
