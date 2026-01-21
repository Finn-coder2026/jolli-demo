import crypto from "node:crypto";

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 * @param payload - Raw webhook payload body (as string)
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param secret - Webhook secret from GitHub App configuration
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
	if (!signature) {
		return false;
	}

	// GitHub sends signature in format: sha256=<hash>
	if (!signature.startsWith("sha256=")) {
		return false;
	}

	const receivedSignature = signature.substring(7); // Remove "sha256=" prefix

	// Compute expected signature
	const hmac = crypto.createHmac("sha256", secret);
	hmac.update(payload);
	const expectedSignature = hmac.digest("hex");

	// Check if lengths match before timing-safe comparison
	// timingSafeEqual requires buffers of the same length
	if (receivedSignature.length !== expectedSignature.length) {
		return false;
	}

	try {
		// Use timing-safe comparison to prevent timing attacks
		return crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature));
	} catch {
		// If any error occurs (e.g., invalid hex), return false
		return false;
	}
}
