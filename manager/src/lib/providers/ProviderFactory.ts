import { env } from "../Config";
import type { DatabaseProvider, NeonProviderConfig, ProviderType } from "../types";
import { decrypt } from "../util/Encryption";
import { ConnectionStringPostgresProvider } from "./ConnectionStringPostgresProvider";
import type { DatabaseProviderAdapter } from "./DatabaseProviderInterface";
import { NeonPostgresProvider } from "./NeonPostgresProvider";

/**
 * Factory for creating database provider adapters.
 * This function is async to support decryption of provider configuration.
 */
export async function createProviderAdapter(
	provider: DatabaseProvider,
	adminConnectionUrl: string,
): Promise<DatabaseProviderAdapter> {
	// Minimal await to satisfy linter - function is async to support future async decryption
	await Promise.resolve();

	switch (provider.type) {
		// "local" is legacy alias for "connection_string"
		case "local":
		case "connection_string":
			return new ConnectionStringPostgresProvider({
				adminConnectionUrl,
				host: provider.connectionTemplate?.host,
				port: provider.connectionTemplate?.port,
				ssl: provider.connectionTemplate?.ssl,
			});

		case "neon": {
			if (!provider.configEncrypted) {
				throw new Error("Neon provider requires configuration. Please configure API key and Organization ID.");
			}
			if (!env.ENCRYPTION_KEY) {
				throw new Error("ENCRYPTION_KEY environment variable is required for Neon provider");
			}
			const configJson = decrypt(provider.configEncrypted, env.ENCRYPTION_KEY);
			const config = JSON.parse(configJson) as NeonProviderConfig;
			return new NeonPostgresProvider(config);
		}

		default: {
			const exhaustiveCheck: never = provider.type;
			throw new Error(`Unknown provider type: ${exhaustiveCheck}`);
		}
	}
}

/**
 * Check if a provider type is supported.
 */
export function isProviderSupported(type: ProviderType): boolean {
	return type === "connection_string" || type === "local" || type === "neon";
}

/**
 * Get list of supported provider types for creating new providers.
 * Does not include "local" since that's a legacy alias.
 */
export function getSupportedProviderTypes(): Array<ProviderType> {
	return ["connection_string", "neon"];
}

/**
 * Get display name for a provider type.
 */
export function getProviderTypeDisplayName(type: ProviderType): string {
	switch (type) {
		case "local":
		case "connection_string":
			return "Connection String";
		case "neon":
			return "Neon";
		default: {
			const exhaustiveCheck: never = type;
			return exhaustiveCheck;
		}
	}
}
