import { getLog } from "../../util/Logger";
import type { ConfigProvider } from "./ConfigProvider";

const log = getLog(import.meta);

/**
 * List of known Jolli configuration variable prefixes.
 * Used to filter process.env to only relevant variables.
 */
const KNOWN_ENV_VAR_PREFIXES = [
	"ANTHROPIC_",
	"AWS_",
	"DEV_TOOLS_",
	"E2B_",
	"GITHUB_",
	"GOOGLE_",
	"JOBS_",
	"LINEAR_",
	"LLM_",
	"LOG_",
	"MAX_",
	"MULTI_TENANT_",
	"NODE_ENV",
	"OPENAI_",
	"ORIGIN",
	"POSTGRES_",
	"PSTORE_",
	"ROOT_PATH",
	"SEED_DATABASE",
	"SEQUELIZE",
	"SESSION_",
	"SMEE_",
	"TOKEN_",
	"TOOLS_PATH",
	"USE_",
	"VERCEL_",
];

/**
 * Configuration provider that reads from local environment variables.
 *
 * This is the lowest priority provider, used as a fallback when neither
 * AWS Parameter Store nor Vercel environment variables are available.
 *
 * In local development, dotenv loads .env.local into process.env before
 * this provider runs, so those values will be picked up here.
 *
 * This provider has priority 3 (lowest) - it's the final fallback.
 */
export class LocalEnvProvider implements ConfigProvider {
	readonly name = "local-env";
	readonly priority = 3; // Lowest priority

	/**
	 * Local environment is always available as a fallback.
	 */
	isAvailable(): boolean {
		return true;
	}

	/**
	 * Load configuration from local environment variables (process.env).
	 * Filters to only include known Jolli configuration variables.
	 */
	load(): Promise<Record<string, string>> {
		log.debug("Loading configuration from local environment");
		return Promise.resolve(this.loadSync());
	}

	private loadSync(): Record<string, string> {
		const result: Record<string, string> = {};

		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined && this.isRelevantEnvVar(key)) {
				result[key] = value;
			}
		}

		log.debug({ varCount: Object.keys(result).length }, "Loaded variables from local environment");
		return result;
	}

	/**
	 * Check if an environment variable name is relevant to Jolli configuration.
	 */
	private isRelevantEnvVar(name: string): boolean {
		return KNOWN_ENV_VAR_PREFIXES.some(prefix => name.startsWith(prefix));
	}
}
