/**
 * Contract reference resolution and normalization utilities.
 */

/**
 * Contract reference types.
 */
export type ContractType = "openapi" | "config";

/**
 * A contract reference identifying an API operation or configuration.
 */
export interface ContractRef {
	/** Type of contract */
	type: ContractType;
	/** Contract key (e.g., operationId or env var name) */
	key: string;
}

/**
 * Parse a contract reference string.
 *
 * Format: "<type>:<key>"
 * Examples:
 * - "openapi:RateLimitService_getLimits"
 * - "config:API_KEY"
 *
 * @param contractRefStr - Contract reference string
 * @returns Parsed contract reference
 * @throws Error if format is invalid
 */
export function parseContractRef(contractRefStr: string): ContractRef {
	const parts = contractRefStr.split(":");
	if (parts.length !== 2) {
		throw new Error(`Invalid contract ref format: "${contractRefStr}". Expected "type:key"`);
	}

	const [type, key] = parts;

	if (type !== "openapi" && type !== "config") {
		throw new Error(`Invalid contract type: "${type}". Expected "openapi" or "config"`);
	}

	if (!key || key.trim() === "") {
		throw new Error(`Invalid contract key: empty key in "${contractRefStr}"`);
	}

	return { type, key };
}

/**
 * Format a contract reference to string.
 *
 * @param contractRef - Contract reference object
 * @returns Formatted string "type:key"
 */
export function formatContractRef(contractRef: ContractRef): string {
	return `${contractRef.type}:${contractRef.key}`;
}

/**
 * Normalize a contract reference string or object.
 *
 * - If string: parse and re-format (validates format)
 * - If object: format to string
 *
 * @param contractRef - Contract reference (string or object)
 * @returns Normalized contract reference string
 */
export function normalizeContractRef(contractRef: string | ContractRef): string {
	if (typeof contractRef === "string") {
		const parsed = parseContractRef(contractRef);
		return formatContractRef(parsed);
	}
	return formatContractRef(contractRef);
}

/**
 * Validate an array of contract references from frontmatter.
 *
 * Frontmatter format:
 * ```yaml
 * covers:
 *   - openapi:Service_method
 *   - config:VAR_NAME
 * ```
 *
 * @param covers - Array of contract reference strings from frontmatter
 * @returns Validated and normalized array of contract references
 * @throws Error if any contract ref is invalid
 */
export function validateCoversArray(covers: unknown): Array<string> {
	if (!Array.isArray(covers)) {
		throw new Error(`Invalid covers: expected array, got ${typeof covers}`);
	}

	const normalized: Array<string> = [];

	for (const item of covers) {
		if (typeof item !== "string") {
			throw new Error(`Invalid contract ref in covers: expected string, got ${typeof item}`);
		}

		// Parse to validate, then normalize
		normalized.push(normalizeContractRef(item));
	}

	return normalized;
}
