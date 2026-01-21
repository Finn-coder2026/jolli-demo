/**
 * DomainVerificationService - Handles DNS-based domain ownership verification.
 *
 * Uses DNS TXT records to verify that a user controls a domain before allowing
 * it to be associated with their tenant.
 */

import { resolveTxt } from "node:dns/promises";

/** Result of attempting to verify a domain */
export interface DomainVerificationResult {
	/** Whether the domain was verified successfully */
	verified: boolean;
	/** Error message if verification failed */
	error?: string;
	/** The expected DNS record value */
	expectedRecord?: string;
	/** The TXT records found at the verification subdomain */
	foundRecords?: Array<string>;
}

/** Configuration for the domain verification service */
export interface DomainVerificationServiceConfig {
	/** Prefix for the verification record value (default: "jolli-verify") */
	verificationPrefix?: string;
}

/**
 * Service for verifying domain ownership via DNS TXT records.
 *
 * @example
 * ```typescript
 * const service = createDomainVerificationService();
 *
 * // Get instructions for the user
 * const instructions = service.getVerificationInstructions("docs.acme.com", "abc123token");
 * console.log(instructions);
 *
 * // Later, verify the domain
 * const result = await service.verifyDomain("docs.acme.com", "abc123token");
 * if (result.verified) {
 *   console.log("Domain verified!");
 * }
 * ```
 */
export interface DomainVerificationService {
	/**
	 * Verify a domain by checking for the expected DNS TXT record.
	 *
	 * @param domain - The domain to verify (e.g., "docs.acme.com")
	 * @param verificationToken - The expected verification token
	 * @returns Verification result with success status and any found records
	 */
	verifyDomain(domain: string, verificationToken: string): Promise<DomainVerificationResult>;

	/**
	 * Get human-readable instructions for setting up domain verification.
	 *
	 * @param domain - The domain to verify
	 * @param verificationToken - The verification token to use
	 * @returns Instructions string
	 */
	getVerificationInstructions(domain: string, verificationToken: string): string;

	/**
	 * Get the DNS record name where the verification TXT record should be placed.
	 *
	 * @param domain - The domain to verify
	 * @returns The full DNS record name (e.g., "_jolli-verification.docs.acme.com")
	 */
	getVerificationRecordName(domain: string): string;

	/**
	 * Get the expected value for the verification TXT record.
	 *
	 * @param verificationToken - The verification token
	 * @returns The expected TXT record value (e.g., "jolli-verify=abc123")
	 */
	getExpectedRecordValue(verificationToken: string): string;
}

const VERIFICATION_SUBDOMAIN = "_jolli-verification";
const DEFAULT_VERIFICATION_PREFIX = "jolli-verify";

/**
 * Create a new domain verification service instance.
 *
 * @param config - Optional configuration
 * @returns DomainVerificationService instance
 */
export function createDomainVerificationService(
	config: DomainVerificationServiceConfig = {},
): DomainVerificationService {
	const verificationPrefix = config.verificationPrefix ?? DEFAULT_VERIFICATION_PREFIX;

	function getVerificationRecordName(domain: string): string {
		return `${VERIFICATION_SUBDOMAIN}.${domain}`;
	}

	function getExpectedRecordValue(verificationToken: string): string {
		return `${verificationPrefix}=${verificationToken}`;
	}

	async function verifyDomain(domain: string, verificationToken: string): Promise<DomainVerificationResult> {
		const recordName = getVerificationRecordName(domain);
		const expectedValue = getExpectedRecordValue(verificationToken);

		try {
			// DNS TXT records are returned as arrays of strings (for records over 255 chars)
			// We join them and check for our expected value
			const records = await resolveTxt(recordName);
			const foundRecords = records.map(parts => parts.join(""));

			const verified = foundRecords.some(record => record.includes(expectedValue));

			const result: DomainVerificationResult = {
				verified,
				expectedRecord: expectedValue,
				foundRecords,
			};

			if (!verified) {
				result.error = `Expected TXT record "${expectedValue}" not found`;
			}

			return result;
		} catch (error) {
			// Handle DNS errors
			const dnsError = error as NodeJS.ErrnoException;

			if (dnsError.code === "ENOTFOUND" || dnsError.code === "ENODATA") {
				return {
					verified: false,
					expectedRecord: expectedValue,
					foundRecords: [],
					error: `No TXT records found at ${recordName}`,
				};
			}

			if (dnsError.code === "ETIMEOUT" || dnsError.code === "ESERVFAIL") {
				return {
					verified: false,
					expectedRecord: expectedValue,
					error: `DNS lookup failed: ${dnsError.message}`,
				};
			}

			// Re-throw unexpected errors
			throw error;
		}
	}

	function getVerificationInstructions(domain: string, verificationToken: string): string {
		const recordName = getVerificationRecordName(domain);
		const expectedValue = getExpectedRecordValue(verificationToken);

		return `To verify ownership of ${domain}, add the following DNS TXT record:

Record Name: ${recordName}
Record Type: TXT
Record Value: ${expectedValue}

After adding the record, DNS propagation may take up to 24-48 hours, but typically completes within minutes.

You can verify the record is set correctly by running:
  dig TXT ${recordName}

Or on Windows:
  nslookup -type=TXT ${recordName}`;
	}

	return {
		verifyDomain,
		getVerificationInstructions,
		getVerificationRecordName,
		getExpectedRecordValue,
	};
}
