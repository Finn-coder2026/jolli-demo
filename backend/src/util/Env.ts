import { config } from "dotenv";

// Module-level load (existing behavior, no override)
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Re-parses .env and .env.local files, updating process.env with new values.
 * This function can be called to refresh env file values at runtime.
 *
 * Note: Uses `override: true` to force re-reading values, overwriting
 * any existing process.env values. Loads .env first, then .env.local
 * so local overrides take precedence.
 */
export function loadEnvFiles(): void {
	config({ path: ".env", override: true, quiet: true });
	config({ path: ".env.local", override: true, quiet: true });
}

/**
 * Gets an environment variable or throws an error if not set.
 * The value is trimmed to remove any whitespace (including newlines).
 *
 * @param key - Environment variable name
 * @returns The trimmed value
 * @throws Error if the environment variable is not set
 */
export function getEnvOrError(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing env var: ${key}`);
	}
	return value.trim();
}
