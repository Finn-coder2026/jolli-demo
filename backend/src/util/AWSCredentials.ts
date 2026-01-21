import { getLog } from "./Logger";
import { getOIDCTokenProvider } from "./OIDCTokenProvider";
import type { STSClientConfig } from "@aws-sdk/client-sts";
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";

const log = getLog(import.meta);

/**
 * Options for creating an OIDC credentials provider.
 */
export interface OIDCCredentialsOptions {
	/** IAM role ARN to assume */
	roleArn: string;
	/** AWS region for STS calls (optional, falls back to AWS_REGION env var) */
	region?: string;
	/** Session name for audit trails (default: "jolli-session") */
	sessionName?: string;
	/** Function that returns the OIDC token */
	getToken: () => string | undefined;
}

/**
 * Creates an AWS credentials provider using OIDC Web Identity federation.
 * Platform-agnostic - works with any OIDC token source (Vercel, Cloudflare, etc.)
 *
 * @param options - Configuration for the OIDC credentials provider
 * @returns A credentials provider function that can be passed to AWS SDK clients
 */
export function createOIDCCredentialsProvider(options: OIDCCredentialsOptions): Provider<AwsCredentialIdentity> {
	const { roleArn, region, sessionName = "jolli-session" } = options;
	let cachedCredentials: AwsCredentialIdentity | null = null;
	let expirationTime: number | null = null;

	return async (): Promise<AwsCredentialIdentity> => {
		// Return cached credentials if still valid (with 5 min buffer)
		const bufferMs = 300000; // 5 minutes
		if (cachedCredentials && expirationTime && Date.now() < expirationTime - bufferMs) {
			log.debug("Using cached OIDC credentials");
			return cachedCredentials;
		}

		const token = options.getToken();
		if (!token) {
			throw new Error("OIDC token not available");
		}

		// Build STS client config, only including region if defined
		const effectiveRegion = region || process.env.AWS_REGION;
		const stsConfig: STSClientConfig = {};
		if (effectiveRegion) {
			stsConfig.region = effectiveRegion;
		}

		const stsClient = new STSClient(stsConfig);
		const command = new AssumeRoleWithWebIdentityCommand({
			RoleArn: roleArn,
			RoleSessionName: sessionName,
			WebIdentityToken: token,
		});

		log.info({ roleArn }, "Assuming AWS role via OIDC");
		const response = await stsClient.send(command);

		if (!response.Credentials) {
			throw new Error("STS AssumeRoleWithWebIdentity returned no credentials");
		}

		const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = response.Credentials;

		if (!AccessKeyId || !SecretAccessKey) {
			throw new Error("STS response missing required credential fields");
		}

		// Build credentials object with all available fields
		cachedCredentials = {
			accessKeyId: AccessKeyId,
			secretAccessKey: SecretAccessKey,
			...(SessionToken && { sessionToken: SessionToken }),
			...(Expiration && { expiration: Expiration }),
		};
		expirationTime = Expiration?.getTime() ?? null;

		log.info("Successfully obtained temporary AWS credentials via OIDC");
		return cachedCredentials;
	};
}

/**
 * Gets the current OIDC token from the configured provider.
 * This is a convenience wrapper around the OIDCTokenProvider interface.
 *
 * @returns The OIDC token or undefined if not available
 */
export function getOIDCToken(): string | undefined {
	return getOIDCTokenProvider().getToken();
}

/**
 * Options for the AWS credentials factory.
 */
export interface AWSCredentialsFactoryOptions {
	/** IAM role ARN to assume via OIDC */
	roleArn?: string;
	/** Whether we are running in a Vercel environment */
	isVercel?: boolean;
	/** AWS region for STS calls */
	region?: string;
}

/**
 * Factory function to create appropriate credentials provider based on environment.
 *
 * - On Vercel with OIDC: Creates an OIDC credentials provider
 * - Elsewhere: Returns undefined to use the default AWS credential chain
 *   (EC2 instance role, env vars, ~/.aws/credentials, etc.)
 *
 * @param options - Configuration options
 * @returns Credentials provider or undefined for default chain
 */
export function createAWSCredentialsProvider(
	options: AWSCredentialsFactoryOptions,
): Provider<AwsCredentialIdentity> | undefined {
	const { roleArn, isVercel, region } = options;

	if (!isVercel || !roleArn) {
		log.debug({ isVercel, hasRoleArn: Boolean(roleArn) }, "Using default AWS credential chain");
		return;
	}

	log.info({ roleArn }, "Configuring OIDC credentials provider");
	const oidcOptions: OIDCCredentialsOptions = {
		roleArn,
		getToken: getOIDCToken,
	};
	if (region) {
		oidcOptions.region = region;
	}
	return createOIDCCredentialsProvider(oidcOptions);
}
