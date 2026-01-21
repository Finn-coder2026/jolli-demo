import { getLog } from "../util/Logger";
import type { ConnectProvider } from "./ConnectProvider";

const log = getLog(import.meta);

/**
 * Registry for managing connect providers.
 * Providers are registered at application startup and looked up by name during request handling.
 */
export class ConnectProviderRegistry {
	private providers = new Map<string, ConnectProvider>();

	/**
	 * Register a connect provider.
	 * If a provider with the same name is already registered, this is a no-op
	 * (supports Vite HMR re-registration).
	 *
	 * @param provider - The provider to register
	 */
	register(provider: ConnectProvider): void {
		const name = provider.name.toLowerCase();
		if (this.providers.has(name)) {
			// Already registered - skip silently (handles Vite HMR re-registration)
			return;
		}
		this.providers.set(name, provider);
		log.info({ provider: name }, "Registered connect provider");
	}

	/**
	 * Get a connect provider by name.
	 *
	 * @param name - The provider name (case-insensitive)
	 * @returns The provider, or undefined if not registered
	 */
	get(name: string): ConnectProvider | undefined {
		return this.providers.get(name.toLowerCase());
	}

	/**
	 * Check if a provider is registered.
	 *
	 * @param name - The provider name (case-insensitive)
	 * @returns true if the provider is registered
	 */
	has(name: string): boolean {
		return this.providers.has(name.toLowerCase());
	}

	/**
	 * List all registered providers.
	 *
	 * @returns Array of all registered providers
	 */
	list(): Array<ConnectProvider> {
		return Array.from(this.providers.values());
	}

	/**
	 * Get all registered provider names.
	 *
	 * @returns Array of provider names
	 */
	names(): Array<string> {
		return Array.from(this.providers.keys());
	}

	/**
	 * Clear all registered providers.
	 * Mainly useful for testing.
	 */
	clear(): void {
		this.providers.clear();
	}
}

/**
 * Global connect provider registry instance.
 * Providers are registered at application startup.
 */
export const connectProviderRegistry = new ConnectProviderRegistry();
