import type { AWSCredentialsFactoryOptions } from "../../util/AWSCredentials";
import { createAWSCredentialsProvider } from "../../util/AWSCredentials";
import { getLog } from "../../util/Logger";
import type { ParameterStoreLoaderOptions } from "../ParameterStoreLoader";
import { ParameterStoreLoader } from "../ParameterStoreLoader";
import type { ConfigProvider } from "./ConfigProvider";

const log = getLog(import.meta);

/**
 * Configuration provider that loads from AWS Systems Manager Parameter Store.
 *
 * Path convention:
 * - For Vercel deployments (VERCEL=1): `/jolli/vercel/{PSTORE_ENV}/*`
 * - For local/other deployments: `/jolli/backend/{PSTORE_ENV}/*`
 *
 * This provider has highest priority (1) and will override values from other providers.
 */
export class AWSParameterStoreProvider implements ConfigProvider {
	readonly name = "aws-parameter-store";
	readonly priority = 1; // Highest priority

	private loader: ParameterStoreLoader | null = null;

	/**
	 * Check if AWS Parameter Store is available.
	 * Available when PSTORE_ENV environment variable is set.
	 */
	isAvailable(): boolean {
		return Boolean(process.env.PSTORE_ENV);
	}

	/**
	 * Load configuration from AWS Parameter Store.
	 *
	 * Uses the path prefix based on deployment environment:
	 * - Vercel (VERCEL=1): /jolli/vercel/{PSTORE_ENV}/
	 * - Other: /jolli/backend/{PSTORE_ENV}/
	 *
	 * On Vercel with AWS_OIDC_ROLE_ARN set, uses OIDC federation for authentication.
	 * Otherwise, falls back to the default AWS credential chain.
	 */
	async load(): Promise<Record<string, string>> {
		const pstoreEnv = process.env.PSTORE_ENV;
		if (!pstoreEnv) {
			log.debug("PSTORE_ENV not set, skipping AWS Parameter Store");
			return {};
		}

		// Determine path base - use /jolli/vercel/ for Vercel deployments
		const isVercel = process.env.VERCEL === "1";
		const pathBase = isVercel ? "vercel" : "backend";
		const roleArn = process.env.AWS_OIDC_ROLE_ARN;

		log.info(
			{ pstoreEnv, pathBase, isVercel, hasOidcRole: Boolean(roleArn) },
			"Loading from AWS Parameter Store: /jolli/%s/%s/",
			pathBase,
			pstoreEnv,
		);

		// Get credentials provider (OIDC on Vercel with role ARN, default chain otherwise)
		// Build options object conditionally to satisfy exactOptionalPropertyTypes
		const credentialsOptions: AWSCredentialsFactoryOptions = { isVercel };
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
		this.loader = new ParameterStoreLoader(loaderOptions);

		try {
			const params = await this.loader.load();
			log.info({ paramCount: Object.keys(params).length }, "Loaded parameters from AWS Parameter Store");
			return params;
		} catch (error) {
			log.error(error, "Failed to load from AWS Parameter Store");
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
