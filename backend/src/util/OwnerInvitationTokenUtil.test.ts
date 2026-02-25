import {
	createOwnerInvitationTokenUtil,
	type GenerateOwnerInvitationTokenParams,
	type OwnerInvitationTokenUtil,
} from "./OwnerInvitationTokenUtil";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("OwnerInvitationTokenUtil", () => {
	const TEST_SECRET = "test-secret-key-for-jwt-signing";
	let tokenUtil: OwnerInvitationTokenUtil;

	beforeEach(() => {
		tokenUtil = createOwnerInvitationTokenUtil(TEST_SECRET);
	});

	describe("generateToken", () => {
		it("should generate a valid JWT token with all required fields", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "owner@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: "John Doe",
				previousOwnerId: null,
				invitationId: 100,
				expiresInSeconds: 3600,
			};

			const result = tokenUtil.generateToken(params);

			expect(result.token).toBeDefined();
			expect(result.tokenHash).toBeDefined();
			expect(result.jti).toBeDefined();

			// Token should be a JWT (three parts separated by dots)
			const parts = result.token.split(".");
			expect(parts).toHaveLength(3);

			// Token hash should be a hex string (SHA-256 = 64 chars)
			expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);

			// JTI should be a UUID
			expect(result.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		it("should include previousOwnerId when provided", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "newowner@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: "Jane Doe",
				previousOwnerId: 42,
				invitationId: 101,
				expiresInSeconds: 3600,
			};

			const result = tokenUtil.generateToken(params);
			const payload = tokenUtil.verifyToken(result.token);

			expect(payload).toBeDefined();
			expect(payload?.previousOwnerId).toBe(42);
		});

		it("should handle null name", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "noname@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: null,
				previousOwnerId: null,
				invitationId: 102,
				expiresInSeconds: 3600,
			};

			const result = tokenUtil.generateToken(params);
			const payload = tokenUtil.verifyToken(result.token);

			expect(payload).toBeDefined();
			expect(payload?.name).toBeNull();
		});

		it("should generate unique JTI for each token", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "test@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: null,
				previousOwnerId: null,
				invitationId: 103,
				expiresInSeconds: 3600,
			};

			const result1 = tokenUtil.generateToken(params);
			const result2 = tokenUtil.generateToken(params);

			expect(result1.jti).not.toBe(result2.jti);
			expect(result1.token).not.toBe(result2.token);
			expect(result1.tokenHash).not.toBe(result2.tokenHash);
		});
	});

	describe("verifyToken", () => {
		it("should verify and decode a valid token", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "owner@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 5,
				name: "Test Owner",
				previousOwnerId: 10,
				invitationId: 104,
				expiresInSeconds: 3600,
			};

			const { token, jti } = tokenUtil.generateToken(params);
			const payload = tokenUtil.verifyToken(token);

			expect(payload).toBeDefined();
			expect(payload?.jti).toBe(jti);
			expect(payload?.type).toBe("owner_invitation");
			expect(payload?.email).toBe("owner@example.com");
			expect(payload?.tenantId).toBe("tenant-123");
			expect(payload?.orgId).toBe("org-456");
			expect(payload?.invitedBy).toBe(5);
			expect(payload?.name).toBe("Test Owner");
			expect(payload?.previousOwnerId).toBe(10);
			expect(payload?.iat).toBeDefined();
			expect(payload?.exp).toBeDefined();
		});

		it("should return undefined for invalid token", () => {
			const result = tokenUtil.verifyToken("invalid-token");

			expect(result).toBeUndefined();
		});

		it("should return undefined for token with wrong secret", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "owner@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: null,
				previousOwnerId: null,
				invitationId: 105,
				expiresInSeconds: 3600,
			};

			const { token } = tokenUtil.generateToken(params);

			// Verify with different secret
			const differentSecretUtil = createOwnerInvitationTokenUtil("different-secret");
			const result = differentSecretUtil.verifyToken(token);

			expect(result).toBeUndefined();
		});

		it("should return undefined for expired token", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "owner@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: null,
				previousOwnerId: null,
				invitationId: 106,
				expiresInSeconds: -1, // Expired immediately
			};

			const { token } = tokenUtil.generateToken(params);
			const result = tokenUtil.verifyToken(token);

			expect(result).toBeUndefined();
		});

		it("should return undefined for token with wrong type", () => {
			// Manually create a JWT with wrong type using jsonwebtoken
			const jwt = require("jsonwebtoken");
			const wrongTypeToken = jwt.sign(
				{
					type: "password_reset", // Wrong type
					email: "test@example.com",
					tenantId: "tenant-123",
					orgId: "org-456",
				},
				TEST_SECRET,
				{ expiresIn: "1h" },
			);

			const result = tokenUtil.verifyToken(wrongTypeToken);

			expect(result).toBeUndefined();
		});

		it("should return undefined for malformed JWT", () => {
			const result = tokenUtil.verifyToken("abc.def.ghi");

			expect(result).toBeUndefined();
		});

		it("should return undefined for unexpected verify errors", () => {
			const jwt = require("jsonwebtoken");
			const verifySpy = vi.spyOn(jwt, "verify").mockImplementation(() => {
				throw new Error("unexpected verify failure");
			});

			try {
				const result = tokenUtil.verifyToken("any-token");
				expect(result).toBeUndefined();
			} finally {
				verifySpy.mockRestore();
			}
		});

		it("should return undefined for empty string", () => {
			const result = tokenUtil.verifyToken("");

			expect(result).toBeUndefined();
		});
	});

	describe("hashToken", () => {
		it("should return consistent hash for same token", () => {
			const token = "test-token-string";

			const hash1 = tokenUtil.hashToken(token);
			const hash2 = tokenUtil.hashToken(token);

			expect(hash1).toBe(hash2);
		});

		it("should return SHA-256 hex string (64 characters)", () => {
			const token = "any-token";

			const hash = tokenUtil.hashToken(token);

			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		it("should return different hashes for different tokens", () => {
			const hash1 = tokenUtil.hashToken("token-a");
			const hash2 = tokenUtil.hashToken("token-b");

			expect(hash1).not.toBe(hash2);
		});

		it("should match the hash from generateToken", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "test@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				name: null,
				previousOwnerId: null,
				invitationId: 107,
				expiresInSeconds: 3600,
			};

			const { token, tokenHash } = tokenUtil.generateToken(params);
			const computedHash = tokenUtil.hashToken(token);

			expect(computedHash).toBe(tokenHash);
		});
	});

	describe("integration", () => {
		it("should generate, verify, and hash tokens correctly end-to-end", () => {
			const params: GenerateOwnerInvitationTokenParams = {
				email: "integration-test@example.com",
				tenantId: "int-tenant",
				orgId: "int-org",
				invitedBy: 99,
				name: "Integration Test",
				previousOwnerId: 50,
				invitationId: 108,
				expiresInSeconds: 7200,
			};

			// Generate token
			const { token, tokenHash, jti } = tokenUtil.generateToken(params);

			// Verify token
			const payload = tokenUtil.verifyToken(token);
			expect(payload).toBeDefined();
			expect(payload?.jti).toBe(jti);
			expect(payload?.email).toBe(params.email);

			// Hash should match
			expect(tokenUtil.hashToken(token)).toBe(tokenHash);
		});
	});
});
