import { verifyWebhookSignature } from "./WebhookUtil";
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

describe("WebhookUtil", () => {
	describe("verifyWebhookSignature", () => {
		const secret = "test-webhook-secret";
		const payload = JSON.stringify({ action: "opened", number: 123 });

		// Helper function to generate valid signature
		function generateSignature(data: string, webhookSecret: string): string {
			const hmac = crypto.createHmac("sha256", webhookSecret);
			hmac.update(data);
			return `sha256=${hmac.digest("hex")}`;
		}

		it("should return true for valid signature", () => {
			const signature = generateSignature(payload, secret);
			expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
		});

		it("should return false for missing signature", () => {
			expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
		});

		it("should return false for signature without sha256 prefix", () => {
			const hmac = crypto.createHmac("sha256", secret);
			hmac.update(payload);
			const signatureWithoutPrefix = hmac.digest("hex");

			expect(verifyWebhookSignature(payload, signatureWithoutPrefix, secret)).toBe(false);
		});

		it("should return false for invalid signature", () => {
			const invalidSignature = "sha256=invalid_hash_value_that_does_not_match";
			expect(verifyWebhookSignature(payload, invalidSignature, secret)).toBe(false);
		});

		it("should return false for signature signed with different secret", () => {
			const differentSecret = "different-secret";
			const signature = generateSignature(payload, differentSecret);
			expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
		});

		it("should return false for signature of different payload", () => {
			const differentPayload = JSON.stringify({ action: "closed", number: 456 });
			const signature = generateSignature(differentPayload, secret);
			expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
		});

		it("should handle empty payload", () => {
			const emptyPayload = "";
			const signature = generateSignature(emptyPayload, secret);
			expect(verifyWebhookSignature(emptyPayload, signature, secret)).toBe(true);
		});

		it("should handle payload with special characters", () => {
			const specialPayload = JSON.stringify({
				message: "Test with special chars: !@#$%^&*(){}[]|\\:;\"'<>,.?/~`",
			});
			const signature = generateSignature(specialPayload, secret);
			expect(verifyWebhookSignature(specialPayload, signature, secret)).toBe(true);
		});

		it("should handle payload with unicode characters", () => {
			const unicodePayload = JSON.stringify({
				message: "Test with unicode: 你好世界 🚀 émojis",
			});
			const signature = generateSignature(unicodePayload, secret);
			expect(verifyWebhookSignature(unicodePayload, signature, secret)).toBe(true);
		});

		it("should return false when signature length does not match", () => {
			const signature = "sha256=abc"; // Too short
			expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
		});

		it("should be case sensitive for signature comparison", () => {
			const signature = generateSignature(payload, secret);
			const uppercaseSignature = signature.toUpperCase();
			// Note: hex digest is lowercase, so uppercase won't match
			expect(verifyWebhookSignature(payload, uppercaseSignature, secret)).toBe(false);
		});

		it("should handle large payloads", () => {
			const largePayload = JSON.stringify({
				data: "x".repeat(10000),
			});
			const signature = generateSignature(largePayload, secret);
			expect(verifyWebhookSignature(largePayload, signature, secret)).toBe(true);
		});

		it("should return false when Buffer.from throws error with invalid input", () => {
			// Create a signature with invalid characters that would cause Buffer issues
			// Use null bytes and other problematic characters
			const signature = `sha256=${"g".repeat(64)}`; // Valid length but contains non-hex chars
			const payload = "test";
			expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
		});

		it("should return false when timingSafeEqual throws an error", () => {
			const payload = "test";
			const signature = generateSignature(payload, secret);

			// Mock timingSafeEqual to throw an error
			const timingSafeEqualSpy = vi.spyOn(crypto, "timingSafeEqual").mockImplementation(() => {
				throw new Error("Mocked error");
			});

			expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);

			timingSafeEqualSpy.mockRestore();
		});
	});
});
