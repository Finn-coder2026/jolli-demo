import { getLog } from "../../util/Logger";
import type { ConfigProvider, ProviderLoadResult } from "./ConfigProvider";

const log = getLog(import.meta);

/**
 * Options for the ConfigProviderChain.
 */
export interface ConfigProviderChainOptions {
	/**
	 * Whether to apply loaded values to process.env.
	 * Default: true
	 */
	applyToProcessEnv?: boolean;
}

/**
 * Result of loading configuration from all providers.
 */
export interface ChainLoadResult {
	/**
	 * Combined configuration from all providers.
	 * Higher priority providers override lower priority ones.
	 */
	config: Record<string, string>;

	/**
	 * Results from each provider that was used.
	 */
	providerResults: Array<ProviderLoadResult>;
}

/**
 * Orchestrates loading configuration from multiple providers in priority order.
 *
 * Providers are sorted by priority (lower number = higher priority).
 * Loading happens from lowest priority first, with higher priority providers
 * overwriting values from lower priority ones.
 *
 * Example chain:
 * 1. LocalEnvProvider (priority 3) - loads .env.local values
 * 2. VercelEnvProvider (priority 2) - overrides with Vercel values
 * 3. AWSParameterStoreProvider (priority 1) - overrides with AWS values
 */
export class ConfigProviderChain {
	private readonly providers: Array<ConfigProvider>;
	private readonly options: ConfigProviderChainOptions;

	constructor(providers: Array<ConfigProvider>, options: ConfigProviderChainOptions = {}) {
		// Sort by priority (lower number = higher priority)
		this.providers = [...providers].sort((a, b) => a.priority - b.priority);
		this.options = {
			applyToProcessEnv: options.applyToProcessEnv ?? true,
		};
	}

	/**
	 * Load configuration from all available providers.
	 *
	 * Providers are loaded in reverse priority order (lowest first),
	 * so higher priority providers override lower ones.
	 *
	 * @returns Combined configuration and details about what was loaded
	 */
	async load(): Promise<ChainLoadResult> {
		const result: Record<string, string> = {};
		const providerResults: Array<ProviderLoadResult> = [];

		// Load from lowest priority first, then higher priorities override
		const sortedByLowestFirst = [...this.providers].reverse();

		for (const provider of sortedByLowestFirst) {
			if (!provider.isAvailable()) {
				log.debug({ provider: provider.name }, "Provider not available, skipping");
				continue;
			}

			try {
				log.info({ provider: provider.name, priority: provider.priority }, "Loading from provider");
				const vars = await provider.load();
				const varCount = Object.keys(vars).length;

				if (varCount > 0) {
					// Merge into result (overwrites lower priority values)
					Object.assign(result, vars);

					providerResults.push({
						providerName: provider.name,
						count: varCount,
						variableNames: Object.keys(vars),
					});

					log.info(
						{ provider: provider.name, varCount },
						"Loaded %d variables from %s",
						varCount,
						provider.name,
					);
				} else {
					log.debug({ provider: provider.name }, "No variables loaded from provider");
				}
			} catch (error) {
				// Log error but continue with other providers
				log.error({ provider: provider.name, error }, "Failed to load from provider, continuing with others");
			}
		}

		// Apply to process.env if configured
		if (this.options.applyToProcessEnv) {
			for (const [key, value] of Object.entries(result)) {
				process.env[key] = value;
			}
			log.debug({ varCount: Object.keys(result).length }, "Applied configuration to process.env");
		}

		return {
			config: result,
			providerResults,
		};
	}

	/**
	 * Get the list of providers in priority order (highest first).
	 */
	getProviders(): ReadonlyArray<ConfigProvider> {
		return this.providers;
	}
}
