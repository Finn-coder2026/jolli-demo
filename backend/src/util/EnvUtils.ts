import { getLog } from "./Logger";

const log = getLog(import.meta);

/**
 * Trims whitespace (including newlines) from an environment variable value.
 *
 * Environment variables can sometimes have trailing newlines when set via
 * scripts or external tools (e.g., Vercel CLI). This function ensures
 * all values are clean before use.
 *
 * @param value - The environment variable value to trim
 * @returns The trimmed value
 */
export function trimEnvValue(value: string): string {
	return value.trim();
}

/**
 * Trims all values in a config record and logs any that had whitespace trimmed.
 *
 * @param configRecord - Record of environment variable names to values
 * @param providerName - Name of the provider for logging purposes
 * @returns New record with all values trimmed
 */
export function trimConfigValues(configRecord: Record<string, string>, providerName: string): Record<string, string> {
	const result: Record<string, string> = {};
	const trimmedKeys: Array<string> = [];

	for (const [key, value] of Object.entries(configRecord)) {
		const trimmed = trimEnvValue(value);
		if (trimmed !== value) {
			trimmedKeys.push(key);
		}
		result[key] = trimmed;
	}

	if (trimmedKeys.length > 0) {
		log.warn(
			{ provider: providerName, trimmedKeys },
			"Trimmed whitespace from %d environment variable(s): %s",
			trimmedKeys.length,
			trimmedKeys.join(", "),
		);
	}

	return result;
}
