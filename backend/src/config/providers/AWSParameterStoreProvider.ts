import type { AWSCredentialsFactoryOptions } from "../../util/AWSCredentials";
import { createAWSCredentialsProvider } from "../../util/AWSCredentials";
import { getLog } from "../../util/Logger";
import { withRetry } from "../../util/Retry";
import type { ParameterStoreLoaderOptions } from "../ParameterStoreLoader";
import { ParameterStoreLoader } from "../ParameterStoreLoader";
import type { ConfigProvider } from "./ConfigProvider";

const log = getLog(import.meta);

/**
 * Configuration provider that loads from AWS Systems Manager Parameter Store.
 *
 * Path convention:
 * - If PSTORE_PATH_BASE is set: `/jolli/{PSTORE_PATH_BASE}/{PSTORE_ENV}/*`
 * - Otherwise defaults to: `/jolli/app/{PSTORE_ENV}/*`
 *
 * This provider has highest priority (1) and will override values from other providers.
 */
export class AWSParameterStoreProvider implements ConfigProvider {
	readonly name = "aws-parameter-store";
	readonly priority = 1; // Highest priority

	private loader: ParameterStoreLoader | null = null;

	/**
	 * Check if AWS Parameter Store is available.
	 * Available when PSTORE_ENV is set AND SKIP_PSTORE is not "true".
	 *
	 * Set SKIP_PSTORE=true to bypass Parameter Store,
	 * which eliminates 500-1500ms of cold start latency from AWS API calls.
	 */
	isAvailable(): boolean {
		// If SKIP_PSTORE is set to "true", skip Parameter Store entirely
		if (process.env.SKIP_PSTORE === "true") {
			log.info("SKIP_PSTORE=true - bypassing AWS Parameter Store for faster cold start");
			return false;
		}
		return Boolean(process.env.PSTORE_ENV);
	}

	/**
	 * Load configuration from AWS Parameter Store.
	 *
	 * Uses the path prefix `/jolli/{pathBase}/{PSTORE_ENV}/` where pathBase
	 * defaults to "app" and can be overridden via PSTORE_PATH_BASE.
	 *
	 * Uses the default AWS credential chain (IAM task role on ECS, env vars, etc.).
	 * If AWS_OIDC_ROLE_ARN is set and useOIDC is enabled, uses OIDC federation.
	 */
	async load(): Promise<Record<string, string>> {
		const pstoreEnv = process.env.PSTORE_ENV;
		if (!pstoreEnv) {
			log.debug("PSTORE_ENV not set, skipping AWS Parameter Store");
			return {};
		}

		// Default path base is "app" for ECS deployments
		const pathBase = process.env.PSTORE_PATH_BASE ?? "app";
		const roleArn = process.env.AWS_OIDC_ROLE_ARN;

		log.info(
			{ pstoreEnv, pathBase, hasOidcRole: Boolean(roleArn) },
			"Loading from AWS Parameter Store: /jolli/%s/%s/",
			pathBase,
			pstoreEnv,
		);

		// Build credentials options — uses default AWS credential chain (IAM task role on ECS)
		const credentialsOptions: AWSCredentialsFactoryOptions = {};
		if (roleArn) {
			credentialsOptions.roleArn = roleArn;
		}
		if (process.env.AWS_REGION) {
			credentialsOptions.region = process.env.AWS_REGION;
		}
		const credentials = createAWSCredentialsProvider(credentialsOptions);

		// Create loader with the appropriate path base and credentials
		// Don't apply to process.env here - the chain handles that
		const loaderOptions: ParameterStoreLoaderOptions = {
			pstoreEnv,
			pathBase,
			applyToProcessEnv: false,
		};
		if (credentials) {
			loaderOptions.credentials = credentials;
		}
		const loader = new ParameterStoreLoader(loaderOptions);
		this.loader = loader;

		try {
			const params = await withRetry(() => loader.load(), {
				maxRetries: 3,
				baseDelayMs: 1000,
				maxDelayMs: 10000,
				label: "Parameter Store",
			});
			log.info({ paramCount: Object.keys(params).length }, "Loaded parameters from AWS Parameter Store");
			return params;
		} catch (error) {
			log.error(error, "Failed to load from AWS Parameter Store after retries");
			throw error;
		}
	}

	/**
	 * Get the underlying loader for reload operations.
	 */
	getLoader(): ParameterStoreLoader | null {
		return this.loader;
	}
}
