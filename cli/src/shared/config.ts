import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/**
 * Boolean schema that accepts string "true"/"false" or boolean values
 */
const BooleanSchema = z.union([z.boolean(), z.string().transform(s => s === "true")]).default(false);

/**
 * Configuration schema definition
 */
const configSchema = {
	// Jolli server URL for API calls and auth (trailing slash stripped after validation)
	JOLLI_URL: z
		.string()
		.url()
		.default("http://localhost:8034")
		.transform(url => url.replace(/\/+$/, "")),

	// Sync server URL (falls back to JOLLI_URL/api when not set)
	SYNC_SERVER_URL: z.string().url().optional(),

	// Enable debug logging
	DEBUG: BooleanSchema,

	// Log level for pino logger
	LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("warn"),

	// JRN prefix for sync-enabled documents (must match backend SYNC_JRN_PREFIX)
	SYNC_JRN_PREFIX: z.string().default("jrn:/global:docs:article/sync-"),
};

/**
 * Infer the config type from the schema
 */
type ConfigSchema = typeof configSchema;
type Config = {
	[K in keyof ConfigSchema]: z.infer<ConfigSchema[K]>;
} & {
	// Always resolved (falls back to JOLLI_URL/api)
	SYNC_SERVER_URL: string;
};

/**
 * Parse a .env file content into key-value pairs.
 * Supports basic .env format: KEY=value, with optional quotes.
 */
function parseEnvFile(content: string): Record<string, string> {
	const result: Record<string, string> = {};

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, eqIndex).trim();
		let value = trimmed.slice(eqIndex + 1).trim();

		// Remove surrounding quotes if present
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		result[key] = value;
	}

	return result;
}

/**
 * Load .env file from a path, returning empty object if file doesn't exist.
 */
function loadEnvFile(path: string): Record<string, string> {
	try {
		const content = readFileSync(path, "utf-8");
		return parseEnvFile(content);
	} catch {
		return {};
	}
}

/**
 * Load environment variables from .env files.
 * Priority (highest to lowest):
 * 1. Process environment variables (e.g., from shell)
 * 2. .env in current working directory (project-level)
 * 3. ~/.jolli/.env (user-level)
 */
function loadEnvFiles(): Record<string, string> {
	const userEnvPath = join(homedir(), ".jolli", ".env");
	const localEnvPath = join(process.cwd(), ".env");

	// Load in order of lowest to highest priority
	const userEnv = loadEnvFile(userEnvPath);
	const localEnv = loadEnvFile(localEnvPath);

	// Merge with priority: user < local < process.env
	return { ...userEnv, ...localEnv };
}

/**
 * Parse environment variables and return validated config
 */
function createConfig(): Config {
	const envFromFiles = loadEnvFiles();

	// Process env takes priority over .env files
	function getEnvValue(key: string): string | undefined {
		const envValue = process.env[key] ?? envFromFiles[key];
		// Treat empty string as undefined so defaults apply
		return envValue === "" ? undefined : envValue;
	}

	const jolliUrl = configSchema.JOLLI_URL.parse(getEnvValue("JOLLI_URL"));
	const explicitSyncUrl = configSchema.SYNC_SERVER_URL.parse(getEnvValue("SYNC_SERVER_URL"));

	return {
		JOLLI_URL: jolliUrl,
		SYNC_SERVER_URL: explicitSyncUrl ?? `${jolliUrl.replace(/\/+$/, "")}/api`,
		DEBUG: configSchema.DEBUG.parse(getEnvValue("DEBUG")),
		LOG_LEVEL: configSchema.LOG_LEVEL.parse(getEnvValue("LOG_LEVEL")),
		SYNC_JRN_PREFIX: configSchema.SYNC_JRN_PREFIX.parse(getEnvValue("SYNC_JRN_PREFIX")),
	};
}

/**
 * Cached config instance
 */
let currentConfig: Config | undefined;

/**
 * Gets the current configuration object.
 * Config is created on first access and cached.
 */
export function getConfig(): Config {
	if (!currentConfig) {
		currentConfig = createConfig();
	}
	return currentConfig;
}

/**
 * Resets the config cache (useful for testing)
 */
export function resetConfig(): void {
	currentConfig = undefined;
}
