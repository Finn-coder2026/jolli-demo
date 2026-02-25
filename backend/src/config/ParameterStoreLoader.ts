import { getLog } from "../util/Logger";
import type { SSMClientConfig } from "@aws-sdk/client-ssm";
import { GetParametersByPathCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";

const log = getLog(import.meta);

/**
 * Converts a parameter path suffix from kebab-case with slashes to UPPER_SNAKE_CASE.
 * Example: "github/apps/info" -> "GITHUB_APPS_INFO"
 */
function pathToEnvVarName(pathSuffix: string): string {
	return pathSuffix
		.split("/")
		.map(part => part.replace(/-/g, "_").toUpperCase())
		.join("_");
}

/**
 * Options for creating a ParameterStoreLoader.
 */
export interface ParameterStoreLoaderOptions {
	/**
	 * The environment name (e.g., "prod", "dev", "staging", "dougs").
	 */
	pstoreEnv: string;

	/**
	 * The path base to use. Defaults to "app".
	 * - "app" uses /jolli/app/{pstoreEnv}/
	 */
	pathBase?: string;

	/**
	 * AWS region. If not provided, uses AWS_REGION env var.
	 */
	region?: string;

	/**
	 * Whether to apply loaded parameters to process.env. Defaults to true.
	 */
	applyToProcessEnv?: boolean;

	/**
	 * Custom AWS credentials provider. If provided, uses this instead of
	 * the default AWS credential chain (env vars, instance role, etc.)
	 */
	credentials?: Provider<AwsCredentialIdentity>;
}

/**
 * Loads environment variables from AWS Systems Manager Parameter Store.
 * Parameters are loaded by prefix and converted to environment variable names.
 */
export class ParameterStoreLoader {
	private readonly pathPrefix: string;
	private ssmClient: SSMClient;
	private cachedParameters: Record<string, string> = {};
	private readonly applyToProcessEnv: boolean;

	/**
	 * Create a ParameterStoreLoader with the given options.
	 */
	constructor(options: ParameterStoreLoaderOptions);

	/**
	 * @deprecated Use the options object constructor instead.
	 * Create a ParameterStoreLoader for /jolli/app/{pstoreEnv}/.
	 */
	constructor(pstoreEnv: string, region?: string, applyToProcessEnv?: boolean);

	constructor(optionsOrPstoreEnv: ParameterStoreLoaderOptions | string, region?: string, applyToProcessEnv = true) {
		// Handle both old and new constructor signatures
		if (typeof optionsOrPstoreEnv === "string") {
			// Legacy constructor
			const pstoreEnv = optionsOrPstoreEnv;
			this.pathPrefix = `/jolli/app/${pstoreEnv}/`;
			this.applyToProcessEnv = applyToProcessEnv;
			const effectiveRegion = region || process.env.AWS_REGION;
			this.ssmClient = new SSMClient(effectiveRegion ? { region: effectiveRegion } : {});
		} else {
			// New options-based constructor
			const opts = optionsOrPstoreEnv;
			const pathBase = opts.pathBase ?? "app";
			this.pathPrefix = `/jolli/${pathBase}/${opts.pstoreEnv}/`;
			this.applyToProcessEnv = opts.applyToProcessEnv ?? true;
			const effectiveRegion = opts.region || process.env.AWS_REGION;

			// Build SSMClient config with optional credentials provider
			const clientConfig: SSMClientConfig = {};
			if (effectiveRegion) {
				clientConfig.region = effectiveRegion;
			}
			if (opts.credentials) {
				clientConfig.credentials = opts.credentials;
				log.debug("SSMClient configured with custom credentials provider");
			}

			this.ssmClient = new SSMClient(clientConfig);
		}
	}

	/**
	 * Loads all parameters matching the prefix from Parameter Store.
	 * Parameters are decrypted and converted to environment variable names.
	 * @returns Record of environment variable names to their values
	 */
	async load(): Promise<Record<string, string>> {
		log.info({ pathPrefix: this.pathPrefix }, "Loading parameters from Parameter Store");
		const parameters: Record<string, string> = {};
		let nextToken: string | undefined;

		do {
			const command = new GetParametersByPathCommand({
				Path: this.pathPrefix,
				Recursive: true,
				WithDecryption: true,
				NextToken: nextToken,
			});

			const response = await this.ssmClient.send(command);
			const paramCount = response.Parameters?.length || 0;
			log.info({ paramCount, pathPrefix: this.pathPrefix }, "Retrieved parameters from Parameter Store");

			for (const param of response.Parameters || []) {
				if (param.Name && param.Value) {
					const envVarName = this.convertParameterNameToEnvVar(param.Name);
					// Trim whitespace from values to prevent issues with trailing newlines
					const trimmedValue = param.Value.trim();
					// Mask sensitive values in logs
					const maskedValue =
						envVarName.includes("SECRET") || envVarName.includes("KEY")
							? "***REDACTED***"
							: trimmedValue.substring(0, 50) + (trimmedValue.length > 50 ? "..." : "");
					log.debug({ paramName: param.Name, envVarName, value: maskedValue }, "Loaded parameter");
					parameters[envVarName] = trimmedValue;

					if (this.applyToProcessEnv) {
						process.env[envVarName] = trimmedValue;
					}
				}
			}

			nextToken = response.NextToken;
		} while (nextToken);

		this.cachedParameters = parameters;
		log.info({ paramCount: Object.keys(parameters).length }, "Parameter Store loading complete");
		return parameters;
	}

	/**
	 * Reloads parameters from Parameter Store, updating environment variables.
	 * @returns Record of environment variable names to their values
	 */
	async reload(): Promise<Record<string, string>> {
		return await this.load();
	}

	/**
	 * Returns the cached parameters without making a new API call.
	 * @returns Record of environment variable names to their values
	 */
	getCached(): Record<string, string> {
		return { ...this.cachedParameters };
	}

	/**
	 * Converts a parameter name to an environment variable name.
	 * Example: "/jolli/app/prod/github/apps/info" -> "GITHUB_APPS_INFO"
	 */
	private convertParameterNameToEnvVar(parameterName: string): string {
		if (!parameterName.startsWith(this.pathPrefix)) {
			throw new Error(
				`Parameter name "${parameterName}" does not start with expected prefix "${this.pathPrefix}"`,
			);
		}

		const suffix = parameterName.substring(this.pathPrefix.length);
		return pathToEnvVarName(suffix);
	}

	/**
	 * Returns the path prefix being used for loading parameters.
	 */
	getPathPrefix(): string {
		return this.pathPrefix;
	}
}
