import {
	createInvitationTokenUtil,
	createInvitationTokenUtilFromEnv,
	type GenerateInvitationTokenParams,
	type InvitationTokenPayload,
} from "./InvitationTokenUtil";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		TOKEN_SECRET: "env-test-secret-key",
		TOKEN_ALGORITHM: "HS256",
	})),
}));

describe("InvitationTokenUtil", () => {
	const testSecret = "test-secret-key-for-testing-purposes-123";
	const testAlgorithm = "HS256" as const;

	describe("generateToken", () => {
		it("should generate a valid JWT token with all required fields", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "invitee@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				role: "member",
				invitationId: 42,
				expiresInSeconds: 3600,
			};

			const result = util.generateToken(params);

			expect(result.token).toBeDefined();
			expect(result.token.length).toBeGreaterThan(0);
			expect(result.tokenHash).toBeDefined();
			expect(result.tokenHash.length).toBe(64); // SHA-256 hex is 64 chars
			expect(result.jti).toBeDefined();
			expect(result.jti.length).toBeGreaterThan(0);
		});

		it("should generate different tokens for each call", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "invitee@example.com",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				role: "member",
				invitationId: 42,
				expiresInSeconds: 3600,
			};

			const result1 = util.generateToken(params);
			const result2 = util.generateToken(params);

			expect(result1.token).not.toBe(result2.token);
			expect(result1.tokenHash).not.toBe(result2.tokenHash);
			expect(result1.jti).not.toBe(result2.jti);
		});

		it("should include all payload fields in the generated token", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "test@example.com",
				tenantId: "tenant-abc",
				orgId: "org-xyz",
				invitedBy: 5,
				role: "admin",
				invitationId: 100,
				expiresInSeconds: 7200,
			};

			const result = util.generateToken(params);
			const decoded = util.verifyToken(result.token);

			expect(decoded).toBeDefined();
			expect(decoded?.type).toBe("invitation");
			expect(decoded?.email).toBe("test@example.com");
			expect(decoded?.tenantId).toBe("tenant-abc");
			expect(decoded?.orgId).toBe("org-xyz");
			expect(decoded?.invitedBy).toBe(5);
			expect(decoded?.role).toBe("admin");
			expect(decoded?.invitationId).toBe(100);
			expect(decoded?.jti).toBe(result.jti);
		});
	});

	describe("verifyToken", () => {
		it("should verify a valid token and return the payload", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "verify@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitedBy: 10,
				role: "owner",
				invitationId: 1,
				expiresInSeconds: 3600,
			};

			const { token } = util.generateToken(params);
			const payload = util.verifyToken(token);

			expect(payload).toBeDefined();
			expect(payload?.email).toBe("verify@example.com");
			expect(payload?.role).toBe("owner");
		});

		it("should return undefined for an invalid token", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);

			const payload = util.verifyToken("invalid-token");

			expect(payload).toBeUndefined();
		});

		it("should return undefined for a token signed with different secret", () => {
			const util1 = createInvitationTokenUtil("secret-1", testAlgorithm);
			const util2 = createInvitationTokenUtil("secret-2", testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitedBy: 1,
				role: "member",
				invitationId: 1,
				expiresInSeconds: 3600,
			};

			const { token } = util1.generateToken(params);
			const payload = util2.verifyToken(token);

			expect(payload).toBeUndefined();
		});

		it("should return undefined for an expired token", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "expired@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitedBy: 1,
				role: "member",
				invitationId: 1,
				expiresInSeconds: -1, // Already expired
			};

			const { token } = util.generateToken(params);
			const payload = util.verifyToken(token);

			expect(payload).toBeUndefined();
		});
	});

	describe("hashToken", () => {
		it("should produce consistent hashes for the same input", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);

			const hash1 = util.hashToken("test-token");
			const hash2 = util.hashToken("test-token");

			expect(hash1).toBe(hash2);
		});

		it("should produce different hashes for different inputs", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);

			const hash1 = util.hashToken("token-1");
			const hash2 = util.hashToken("token-2");

			expect(hash1).not.toBe(hash2);
		});

		it("should produce a 64-character hex string", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);

			const hash = util.hashToken("any-token");

			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	});

	describe("token type validation", () => {
		it("should include type='invitation' in the payload", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);
			const params: GenerateInvitationTokenParams = {
				email: "type-test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitedBy: 1,
				role: "member",
				invitationId: 1,
				expiresInSeconds: 3600,
			};

			const { token } = util.generateToken(params);
			const payload = util.verifyToken(token) as InvitationTokenPayload;

			expect(payload.type).toBe("invitation");
		});

		it("should return undefined for a token with wrong type", () => {
			const util = createInvitationTokenUtil(testSecret, testAlgorithm);

			// Create a token with a different type (not 'invitation')
			const wrongTypeToken = jwt.sign(
				{
					type: "password_reset", // Wrong type
					email: "test@example.com",
					tenantId: "tenant-1",
					orgId: "org-1",
					invitedBy: 1,
					role: "member",
					invitationId: 1,
				},
				testSecret,
				{ algorithm: testAlgorithm, expiresIn: 3600 },
			);

			const payload = util.verifyToken(wrongTypeToken);

			expect(payload).toBeUndefined();
		});
	});

	describe("createInvitationTokenUtilFromEnv", () => {
		it("should create utility using environment configuration", () => {
			const util = createInvitationTokenUtilFromEnv();

			// The utility should work - generate a token
			const params: GenerateInvitationTokenParams = {
				email: "env-test@example.com",
				tenantId: "tenant-env",
				orgId: "org-env",
				invitedBy: 1,
				role: "member",
				invitationId: 99,
				expiresInSeconds: 3600,
			};

			const result = util.generateToken(params);

			expect(result.token).toBeDefined();
			expect(result.tokenHash).toBeDefined();
			expect(result.jti).toBeDefined();

			// Verify the token can be decoded
			const payload = util.verifyToken(result.token);
			expect(payload).toBeDefined();
			expect(payload?.email).toBe("env-test@example.com");
		});
	});
});
