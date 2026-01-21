import {
	buildBootstrapMessage,
	createBootstrapAuthHeaders,
	createBootstrapSignature,
	DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
	isTimestampValid,
	verifyBootstrapSignature,
} from "./BootstrapAuth";
import { beforeEach, describe, expect, test, vi } from "vitest";

const TEST_SECRET = "test-bootstrap-secret-12345";
const TEST_TENANT_ID = "tenant-abc123";
const TEST_ORG_ID = "org-xyz789";

describe("BootstrapAuth", () => {
	describe("buildBootstrapMessage", () => {
		test("creates correct message format", () => {
			const timestamp = "2025-12-17T12:00:00.000Z";
			const message = buildBootstrapMessage({
				tenantId: TEST_TENANT_ID,
				orgId: TEST_ORG_ID,
				timestamp,
			});
			expect(message).toBe(`${TEST_TENANT_ID}:${TEST_ORG_ID}:${timestamp}`);
		});

		test("handles special characters in IDs", () => {
			const message = buildBootstrapMessage({
				tenantId: "tenant:with:colons",
				orgId: "org-with-dashes",
				timestamp: "2025-12-17T12:00:00.000Z",
			});
			expect(message).toBe("tenant:with:colons:org-with-dashes:2025-12-17T12:00:00.000Z");
		});
	});

	describe("createBootstrapSignature", () => {
		test("generates sha256= prefixed signature", () => {
			const signature = createBootstrapSignature(
				{
					tenantId: TEST_TENANT_ID,
					orgId: TEST_ORG_ID,
					timestamp: "2025-12-17T12:00:00.000Z",
				},
				TEST_SECRET,
			);
			expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
		});

		test("produces consistent signature for same inputs", () => {
			const params = {
				tenantId: TEST_TENANT_ID,
				orgId: TEST_ORG_ID,
				timestamp: "2025-12-17T12:00:00.000Z",
			};
			const sig1 = createBootstrapSignature(params, TEST_SECRET);
			const sig2 = createBootstrapSignature(params, TEST_SECRET);
			expect(sig1).toBe(sig2);
		});

		test("produces different signature for different secrets", () => {
			const params = {
				tenantId: TEST_TENANT_ID,
				orgId: TEST_ORG_ID,
				timestamp: "2025-12-17T12:00:00.000Z",
			};
			const sig1 = createBootstrapSignature(params, TEST_SECRET);
			const sig2 = createBootstrapSignature(params, "different-secret");
			expect(sig1).not.toBe(sig2);
		});

		test("produces different signature for different tenantId", () => {
			const timestamp = "2025-12-17T12:00:00.000Z";
			const sig1 = createBootstrapSignature({ tenantId: "tenant-1", orgId: TEST_ORG_ID, timestamp }, TEST_SECRET);
			const sig2 = createBootstrapSignature({ tenantId: "tenant-2", orgId: TEST_ORG_ID, timestamp }, TEST_SECRET);
			expect(sig1).not.toBe(sig2);
		});

		test("produces different signature for different orgId", () => {
			const timestamp = "2025-12-17T12:00:00.000Z";
			const sig1 = createBootstrapSignature({ tenantId: TEST_TENANT_ID, orgId: "org-1", timestamp }, TEST_SECRET);
			const sig2 = createBootstrapSignature({ tenantId: TEST_TENANT_ID, orgId: "org-2", timestamp }, TEST_SECRET);
			expect(sig1).not.toBe(sig2);
		});

		test("produces different signature for different timestamp", () => {
			const sig1 = createBootstrapSignature(
				{ tenantId: TEST_TENANT_ID, orgId: TEST_ORG_ID, timestamp: "2025-12-17T12:00:00.000Z" },
				TEST_SECRET,
			);
			const sig2 = createBootstrapSignature(
				{ tenantId: TEST_TENANT_ID, orgId: TEST_ORG_ID, timestamp: "2025-12-17T12:01:00.000Z" },
				TEST_SECRET,
			);
			expect(sig1).not.toBe(sig2);
		});
	});

	describe("createBootstrapAuthHeaders", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2025-12-17T12:00:00.000Z"));
		});

		test("creates headers with signature and timestamp", () => {
			const headers = createBootstrapAuthHeaders(TEST_TENANT_ID, TEST_ORG_ID, TEST_SECRET);

			expect(headers["X-Bootstrap-Timestamp"]).toBe("2025-12-17T12:00:00.000Z");
			expect(headers["X-Bootstrap-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
		});

		test("signature matches timestamp in headers", () => {
			const headers = createBootstrapAuthHeaders(TEST_TENANT_ID, TEST_ORG_ID, TEST_SECRET);

			const expectedSig = createBootstrapSignature(
				{
					tenantId: TEST_TENANT_ID,
					orgId: TEST_ORG_ID,
					timestamp: headers["X-Bootstrap-Timestamp"],
				},
				TEST_SECRET,
			);
			expect(headers["X-Bootstrap-Signature"]).toBe(expectedSig);
		});

		test("generates new timestamp each call", () => {
			const headers1 = createBootstrapAuthHeaders(TEST_TENANT_ID, TEST_ORG_ID, TEST_SECRET);
			vi.setSystemTime(new Date("2025-12-17T12:05:00.000Z"));
			const headers2 = createBootstrapAuthHeaders(TEST_TENANT_ID, TEST_ORG_ID, TEST_SECRET);

			expect(headers1["X-Bootstrap-Timestamp"]).not.toBe(headers2["X-Bootstrap-Timestamp"]);
		});

		afterEach(() => {
			vi.useRealTimers();
		});
	});

	describe("verifyBootstrapSignature", () => {
		const validParams = {
			tenantId: TEST_TENANT_ID,
			orgId: TEST_ORG_ID,
			timestamp: "2025-12-17T12:00:00.000Z",
		};

		test("returns true for valid signature", () => {
			const signature = createBootstrapSignature(validParams, TEST_SECRET);
			const result = verifyBootstrapSignature(validParams, signature, TEST_SECRET);
			expect(result).toBe(true);
		});

		test("returns false for undefined signature", () => {
			const result = verifyBootstrapSignature(validParams, undefined, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false for signature without sha256= prefix", () => {
			const signature = createBootstrapSignature(validParams, TEST_SECRET);
			const signatureWithoutPrefix = signature.substring(7);
			const result = verifyBootstrapSignature(validParams, signatureWithoutPrefix, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false for invalid signature", () => {
			const result = verifyBootstrapSignature(
				validParams,
				"sha256=invalid_signature_that_is_not_hex",
				TEST_SECRET,
			);
			expect(result).toBe(false);
		});

		test("returns false for signature with wrong hex length", () => {
			const result = verifyBootstrapSignature(validParams, "sha256=abc123", TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false for signature made with wrong secret", () => {
			const signature = createBootstrapSignature(validParams, "wrong-secret");
			const result = verifyBootstrapSignature(validParams, signature, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false when tenantId is tampered", () => {
			const signature = createBootstrapSignature(validParams, TEST_SECRET);
			const tamperedParams = { ...validParams, tenantId: "tampered-tenant" };
			const result = verifyBootstrapSignature(tamperedParams, signature, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false when orgId is tampered", () => {
			const signature = createBootstrapSignature(validParams, TEST_SECRET);
			const tamperedParams = { ...validParams, orgId: "tampered-org" };
			const result = verifyBootstrapSignature(tamperedParams, signature, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false when timestamp is tampered", () => {
			const signature = createBootstrapSignature(validParams, TEST_SECRET);
			const tamperedParams = { ...validParams, timestamp: "2025-12-17T13:00:00.000Z" };
			const result = verifyBootstrapSignature(tamperedParams, signature, TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false for empty signature string", () => {
			const result = verifyBootstrapSignature(validParams, "", TEST_SECRET);
			expect(result).toBe(false);
		});

		test("returns false for signature with only prefix", () => {
			const result = verifyBootstrapSignature(validParams, "sha256=", TEST_SECRET);
			expect(result).toBe(false);
		});
	});

	describe("isTimestampValid", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2025-12-17T12:00:00.000Z"));
		});

		test("returns true for current timestamp", () => {
			const result = isTimestampValid("2025-12-17T12:00:00.000Z");
			expect(result).toBe(true);
		});

		test("returns true for timestamp 1 minute ago", () => {
			const result = isTimestampValid("2025-12-17T11:59:00.000Z");
			expect(result).toBe(true);
		});

		test("returns true for timestamp 4 minutes ago (within default 5 min window)", () => {
			const result = isTimestampValid("2025-12-17T11:56:00.000Z");
			expect(result).toBe(true);
		});

		test("returns true for timestamp exactly at tolerance boundary", () => {
			// 5 minutes ago exactly
			const result = isTimestampValid("2025-12-17T11:55:00.000Z");
			expect(result).toBe(true);
		});

		test("returns false for timestamp beyond tolerance (6 minutes ago)", () => {
			const result = isTimestampValid("2025-12-17T11:54:00.000Z");
			expect(result).toBe(false);
		});

		test("returns true for timestamp 1 minute in future (handles clock skew)", () => {
			const result = isTimestampValid("2025-12-17T12:01:00.000Z");
			expect(result).toBe(true);
		});

		test("returns false for timestamp 6 minutes in future", () => {
			const result = isTimestampValid("2025-12-17T12:06:00.000Z");
			expect(result).toBe(false);
		});

		test("returns false for undefined timestamp", () => {
			const result = isTimestampValid(undefined);
			expect(result).toBe(false);
		});

		test("returns false for empty string timestamp", () => {
			const result = isTimestampValid("");
			expect(result).toBe(false);
		});

		test("returns false for invalid date string", () => {
			const result = isTimestampValid("not-a-date");
			expect(result).toBe(false);
		});

		test("returns false for malformed ISO string", () => {
			const result = isTimestampValid("2025-13-45T99:99:99.999Z");
			expect(result).toBe(false);
		});

		test("respects custom tolerance parameter", () => {
			// 2 minutes ago
			const timestamp = "2025-12-17T11:58:00.000Z";
			const oneMinuteMs = 60 * 1000;
			const threeMinutesMs = 3 * 60 * 1000;

			// Should fail with 1 minute tolerance
			expect(isTimestampValid(timestamp, oneMinuteMs)).toBe(false);

			// Should pass with 3 minute tolerance
			expect(isTimestampValid(timestamp, threeMinutesMs)).toBe(true);
		});

		test("uses default tolerance constant", () => {
			expect(DEFAULT_BOOTSTRAP_TIMESTAMP_TOLERANCE_MS).toBe(5 * 60 * 1000);
		});

		afterEach(() => {
			vi.useRealTimers();
		});
	});
});
