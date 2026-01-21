import { getLog } from "./Logger";
import dns from "node:dns/promises";

const log = getLog(import.meta);

// Use Google's public DNS for reliable lookups (avoids local DNS cache issues)
const resolver = new dns.Resolver();
resolver.setServers(["8.8.8.8", "8.8.4.4"]);

// Vercel's expected DNS targets
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";
const VERCEL_A_RECORD_IPS = ["76.76.21.21"];

export interface DnsCheckResult {
	/** Whether DNS is configured to point to Vercel */
	configured: boolean;
	/** The record type found (CNAME, A, or null if not found) */
	recordType: "CNAME" | "A" | null;
	/** The actual value found in DNS */
	actualValue: string | null;
	/** Expected value for comparison */
	expectedValue: string;
	/** Error message if lookup failed */
	error?: string;
}

/**
 * Check if a domain's DNS is configured to point to Vercel.
 *
 * For subdomains, checks for CNAME pointing to cname.vercel-dns.com
 * For apex domains, checks for A record pointing to 76.76.21.21
 *
 * @param domain - The domain to check (e.g., "docs.example.com" or "example.com")
 * @returns DNS check result
 */
export async function checkDnsConfiguration(domain: string): Promise<DnsCheckResult> {
	const isApexDomain = domain.split(".").length === 2;

	if (isApexDomain) {
		return await checkARecord(domain);
	}
	return await checkCnameRecord(domain);
}

/**
 * Check if a domain has a CNAME record pointing to Vercel.
 */
async function checkCnameRecord(domain: string): Promise<DnsCheckResult> {
	try {
		const records = await resolver.resolveCname(domain);
		log.debug({ domain, records }, "CNAME lookup result");

		// Check if any CNAME points to Vercel
		const pointsToVercel = records.some(
			record => record.toLowerCase() === VERCEL_CNAME_TARGET || record.toLowerCase().endsWith(".vercel-dns.com"),
		);

		return {
			configured: pointsToVercel,
			recordType: "CNAME",
			actualValue: records[0] || null,
			expectedValue: VERCEL_CNAME_TARGET,
		};
	} catch (error) {
		const errorCode = (error as NodeJS.ErrnoException).code;

		// ENODATA or ENOTFOUND means no CNAME record exists
		if (errorCode === "ENODATA" || errorCode === "ENOTFOUND") {
			// Try A record as fallback (some subdomains use A records)
			return checkARecord(domain);
		}

		log.warn({ domain, error: String(error) }, "DNS CNAME lookup failed");
		return {
			configured: false,
			recordType: null,
			actualValue: null,
			expectedValue: VERCEL_CNAME_TARGET,
			error: `DNS lookup failed: ${errorCode || String(error)}`,
		};
	}
}

/**
 * Check if a domain has an A record pointing to Vercel.
 */
async function checkARecord(domain: string): Promise<DnsCheckResult> {
	try {
		const records = await resolver.resolve4(domain);
		log.debug({ domain, records }, "A record lookup result");

		// Check if any A record points to Vercel
		const pointsToVercel = records.some(ip => VERCEL_A_RECORD_IPS.includes(ip));

		return {
			configured: pointsToVercel,
			recordType: "A",
			actualValue: records[0] || null,
			expectedValue: VERCEL_A_RECORD_IPS[0],
		};
	} catch (error) {
		const errorCode = (error as NodeJS.ErrnoException).code;

		// ENODATA or ENOTFOUND means no A record exists
		if (errorCode === "ENODATA" || errorCode === "ENOTFOUND") {
			log.debug({ domain }, "No DNS records found for domain");
			return {
				configured: false,
				recordType: null,
				actualValue: null,
				expectedValue: VERCEL_A_RECORD_IPS[0],
			};
		}

		log.warn({ domain, error: String(error) }, "DNS A record lookup failed");
		return {
			configured: false,
			recordType: null,
			actualValue: null,
			expectedValue: VERCEL_A_RECORD_IPS[0],
			error: `DNS lookup failed: ${errorCode || String(error)}`,
		};
	}
}
