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
 * Configuration provider that reads from Vercel environment variables.
 *
 * Vercel automatically injects environment variables into process.env.
 * This provider reads those values as a fallback when AWS Parameter Store
 * is not available or doesn't have a particular value.
 *
 * This provider has priority 2 (medium) - below AWS but above local env files.
 */
export class VercelEnvProvider implements ConfigProvider {
	readonly name = "vercel-env";
	readonly priority = 2;

	/**
	 * Check if running in a Vercel environment.
	 * Vercel sets VERCEL=1 automatically.
	 */
	isAvailable(): boolean {
		return process.env.VERCEL === "1";
	}

	/**
	 * Load configuration from Vercel-injected environment variables.
	 * Filters process.env to only include known Jolli configuration variables.
	 */
	load(): Promise<Record<string, string>> {
		return Promise.resolve(this.loadSync());
	}

	private loadSync(): Record<string, string> {
		if (!this.isAvailable()) {
			log.debug("Not running in Vercel environment, skipping VercelEnvProvider");
			return {};
		}

		log.info("Loading configuration from Vercel environment");

		const result: Record<string, string> = {};

		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined && this.isRelevantEnvVar(key)) {
				result[key] = value;
			}
		}

		log.info({ varCount: Object.keys(result).length }, "Loaded variables from Vercel environment");
		return result;
	}

	/**
	 * Check if an environment variable name is relevant to Jolli configuration.
	 */
	private isRelevantEnvVar(name: string): boolean {
		return KNOWN_ENV_VAR_PREFIXES.some(prefix => name.startsWith(prefix));
	}
}
