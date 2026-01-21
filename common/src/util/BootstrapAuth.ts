import crypto from "node:crypto";

/**
 * Parameters for building or verifying a bootstrap signature.
 */
export interface BootstrapSignatureParams {
	tenantId: string;
	orgId: string;
	timestamp: string; // ISO 8601 format
}

/**
 * Headers required for authenticated bootstrap requests.
 */
export interface BootstrapAuthHeaders {
	"X-Bootstrap-Signature": string;
	"X-Bootstrap-Timestamp": string;
}

/**
 * Default timestamp tolerance window in milliseconds (5 minutes).
 */
export const DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Constructs the message to be signed from request parameters.
 * Format: {tenantId}:{orgId}:{timestamp}
 *
 * @param params - The signature parameters
 * @returns The message string to be signed
 */
export function buildBootstrapMessage(params: BootstrapSignatureParams): string {
	return `${params.tenantId}:${params.orgId}:${params.timestamp}`;
}

/**
 * Creates HMAC-SHA256 signature for bootstrap request.
 *
 * @param params - The signature parameters (tenantId, orgId, timestamp)
 * @param secret - The shared secret for HMAC signing
 * @returns Signature in format: sha256=<hex_digest>
 */
export function createBootstrapSignature(params: BootstrapSignatureParams, secret: string): string {
	const message = buildBootstrapMessage(params);
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(message);
	return `sha256=${hmac.digest("hex")}`;
}

/**
 * Creates headers for authenticated bootstrap request including signature and timestamp.
 *
 * @param tenantId - The tenant ID being provisioned
 * @param orgId - The org ID being provisioned
 * @param secret - The shared secret for HMAC signing
 * @returns Object with X-Bootstrap-Signature and X-Bootstrap-Timestamp headers
 */
export function createBootstrapAuthHeaders(tenantId: string, orgId: string, secret: string): BootstrapAuthHeaders {
	const timestamp = new Date().toISOString();
	const signature = createBootstrapSignature({ tenantId, orgId, timestamp }, secret);
	return {
		"X-Bootstrap-Signature": signature,
		"X-Bootstrap-Timestamp": timestamp,
	};
}

/**
 * Verifies bootstrap request signature using timing-safe comparison.
 *
 * @param params - The signature parameters to verify against
 * @param signature - The received signature (should be in format sha256=<hex>)
 * @param secret - The shared secret for HMAC verification
 * @returns true if signature is valid, false otherwise
 */
export function verifyBootstrapSignature(
	params: BootstrapSignatureParams,
	signature: string | undefined,
	secret: string,
): boolean {
	if (!signature) {
		return false;
	}

	// Signature must have sha256= prefix
	if (!signature.startsWith("sha256=")) {
		return false;
	}

	const receivedSignature = signature.substring(7); // Remove "sha256=" prefix
	const expectedSignature = createBootstrapSignature(params, secret).substring(7);

	// Length check before timing-safe comparison (timingSafeEqual requires equal lengths)
	if (receivedSignature.length !== expectedSignature.length) {
		return false;
	}

	return crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature));
}

/**
 * Validates that timestamp is within acceptable window.
 * Uses absolute difference to handle minor clock skew in either direction.
 *
 * @param timestamp - ISO 8601 timestamp string from request
 * @param toleranceMs - Maximum allowed age in milliseconds (default: 5 minutes)
 * @returns true if timestamp is valid and within tolerance, false otherwise
 */
export function isTimestampValid(
	timestamp: string | undefined,
	toleranceMs: number = DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
): boolean {
	if (!timestamp) {
		return false;
	}

	const requestTime = new Date(timestamp).getTime();
	if (Number.isNaN(requestTime)) {
		return false;
	}

	const now = Date.now();
	const age = Math.abs(now - requestTime);
	return age <= toleranceMs;
}
