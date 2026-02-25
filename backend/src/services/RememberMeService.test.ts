import * as Config from "../config/Config";
import type { RememberMeTokenDao } from "../dao/RememberMeTokenDao";
import { createRememberMeService, RememberMeService } from "./RememberMeService";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config");

/** Helper to hash a token the same way the service does */
function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

// Helper constants for valid 43-char base64url tokens (32 bytes = 43 chars)
const VALID_SERIES = "a".repeat(43);
const VALID_TOKEN = "b".repeat(43);
const VALID_TOKEN_ALT = "c".repeat(43);
const VALID_TOKEN_PREV = "d".repeat(43);

describe("RememberMeService", () => {
	let mockDao: RememberMeTokenDao;
	let service: RememberMeService;

	beforeEach(() => {
		vi.clearAllMocks();

		mockDao = {
			createToken: vi.fn(),
			findBySeries: vi.fn(),
			findByUserId: vi.fn().mockResolvedValue([]), // Default to empty for enforceTokenLimit
			rotateToken: vi.fn(),
			updateToken: vi.fn(),
			updateExpiry: vi.fn(),
			deleteBySeries: vi.fn(),
			deleteAllForUser: vi.fn(),
			deleteExpired: vi.fn(),
		};

		vi.mocked(Config.getConfig).mockReturnValue({
			REMEMBER_ME_DURATION: "30d",
			REMEMBER_ME_ROTATION: true,
			REMEMBER_ME_MAX_TOKENS_PER_USER: 10,
		} as never);

		service = new RememberMeService(mockDao);
	});

	describe("createToken", () => {
		it("should create a token and return series:token format", async () => {
			vi.mocked(mockDao.createToken).mockResolvedValue({
				series: "test-series",
				userId: 123,
				tokenHash: "hashed",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0",
				ipAddress: "192.168.1.1",
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			const combinedToken = await service.createToken(123, "Mozilla/5.0", "192.168.1.1");

			// Token should be in series:token format
			expect(combinedToken).toBeDefined();
			expect(typeof combinedToken).toBe("string");
			expect(combinedToken).toContain(":");

			const [series, token] = combinedToken.split(":");
			expect(series.length).toBeGreaterThan(0);
			expect(token.length).toBeGreaterThan(0);

			// Verify createToken was called with correct parameters
			expect(mockDao.createToken).toHaveBeenCalledTimes(1);
			const createCall = vi.mocked(mockDao.createToken).mock.calls[0][0];
			expect(createCall.userId).toBe(123);
			expect(createCall.userAgent).toBe("Mozilla/5.0");
			expect(createCall.ipAddress).toBe("192.168.1.1");
			expect(createCall.series).toBeDefined();
			expect(createCall.tokenHash).toBeDefined();
			expect(createCall.tokenHash).not.toBe(token); // Hash should be different from plaintext
			expect(createCall.expiresAt).toBeInstanceOf(Date);
		});

		it("should create a token with null user agent and IP when not provided", async () => {
			vi.mocked(mockDao.createToken).mockResolvedValue({
				series: "test-series",
				userId: 123,
				tokenHash: "hashed",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			await service.createToken(123);

			const createCall = vi.mocked(mockDao.createToken).mock.calls[0][0];
			expect(createCall.userAgent).toBeNull();
			expect(createCall.ipAddress).toBeNull();
		});
	});

	describe("validateToken", () => {
		// Helper to generate a valid token with correct length (43 chars base64url = 32 bytes)
		const validSeriesLength = "a".repeat(43);
		const validTokenLength = "b".repeat(43);

		it("should return valid=false for invalid token format (no colon)", async () => {
			const result = await service.validateToken("tokenWithoutColon");

			expect(result.valid).toBe(false);
			expect(result.userId).toBeUndefined();
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for invalid token format (empty series)", async () => {
			const result = await service.validateToken(":sometoken");

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for invalid token format (empty token)", async () => {
			const result = await service.validateToken("someseries:");

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for series with incorrect length (too short)", async () => {
			const shortSeries = "a".repeat(42); // Expected 43
			const validToken = "b".repeat(43);
			const result = await service.validateToken(`${shortSeries}:${validToken}`);

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for series with incorrect length (too long)", async () => {
			const longSeries = "a".repeat(44); // Expected 43
			const validToken = "b".repeat(43);
			const result = await service.validateToken(`${longSeries}:${validToken}`);

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for token with incorrect length (too short)", async () => {
			const validSeries = "a".repeat(43);
			const shortToken = "b".repeat(42); // Expected 43
			const result = await service.validateToken(`${validSeries}:${shortToken}`);

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for token with incorrect length (too long)", async () => {
			const validSeries = "a".repeat(43);
			const longToken = "b".repeat(44); // Expected 43
			const result = await service.validateToken(`${validSeries}:${longToken}`);

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for combined token exceeding max length", async () => {
			const veryLongToken = "a".repeat(101); // MAX_COMBINED_TOKEN_LENGTH is 100
			const result = await service.validateToken(veryLongToken);

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false for empty combined token", async () => {
			const result = await service.validateToken("");

			expect(result.valid).toBe(false);
			expect(mockDao.findBySeries).not.toHaveBeenCalled();
		});

		it("should return valid=false when series is not found", async () => {
			vi.mocked(mockDao.findBySeries).mockResolvedValue(undefined);

			const result = await service.validateToken(`${validSeriesLength}:${validTokenLength}`);

			expect(result.valid).toBe(false);
			expect(result.userId).toBeUndefined();
			expect(result.newToken).toBeUndefined();
		});

		it("should return valid=false and delete token when expired", async () => {
			const expiredDate = new Date(Date.now() - 1000); // 1 second ago
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: validSeriesLength,
				userId: 123,
				tokenHash: hashToken(validTokenLength),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: expiredDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${validSeriesLength}:${validTokenLength}`);

			expect(result.valid).toBe(false);
			expect(mockDao.deleteBySeries).toHaveBeenCalledWith(validSeriesLength);
		});

		it("should detect token theft when series exists but token does not match", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN_ALT), // Different from what we're validating
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			expect(result.valid).toBe(false);
			expect(result.possibleTheft).toBe(true);
			expect(result.userId).toBe(123);
			// Enhanced theft detection: revoke ALL user tokens, not just this series
			expect(mockDao.deleteAllForUser).toHaveBeenCalledWith(123);
		});

		it("should return valid=true with userId when token is valid", async () => {
			const futureDate = new Date(Date.now() + 86400000); // 1 day from now
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago (older than rotation interval)
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`, "Mozilla/5.0", "192.168.1.1");

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
			// Should have new token due to rotation (but same series)
			expect(result.newToken).toBeDefined();
			expect(result.newToken).toContain(`${VALID_SERIES}:`);
			// Should use atomic rotateToken to update hash, previousHash, rotatedAt, expiry, and lastUsed in one call
			expect(mockDao.rotateToken).toHaveBeenCalledTimes(1);
		});

		it("should accept previous token within grace period", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			// Simulate a token that was recently rotated - previousTokenHash is set and rotatedAt is recent
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN), // Current token hash
				previousTokenHash: hashToken(VALID_TOKEN_PREV), // Previous token hash
				rotatedAt: new Date(Date.now() - 5000), // Rotated 5 seconds ago (within 10s grace period)
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			// Validate using the PREVIOUS token (simulating concurrent request after rotation)
			const result = await service.validateToken(
				`${VALID_SERIES}:${VALID_TOKEN_PREV}`,
				"Mozilla/5.0",
				"192.168.1.1",
			);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
			// Previous token within grace period is valid but does NOT trigger rotation
			expect(result.newToken).toBeUndefined();
			expect(mockDao.rotateToken).not.toHaveBeenCalled();
		});

		it("should not rotate token when rotation is disabled", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_DURATION: "30d",
				REMEMBER_ME_ROTATION: false,
			} as never);

			// Create new service with rotation disabled
			const nonRotatingService = new RememberMeService(mockDao);

			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			const result = await nonRotatingService.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
			expect(result.newToken).toBeUndefined();
			expect(mockDao.createToken).not.toHaveBeenCalled();
			expect(mockDao.updateToken).not.toHaveBeenCalled();
		});

		it("should NOT rotate fresh tokens (less than 15 minutes old)", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago (fresh)
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
			// Fresh token should NOT be rotated
			expect(result.newToken).toBeUndefined();
			expect(mockDao.createToken).not.toHaveBeenCalled();
			expect(mockDao.updateToken).not.toHaveBeenCalled();
			expect(mockDao.updateExpiry).not.toHaveBeenCalled();
		});

		it("should validate token when IP address changes (logs warning but still valid)", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0",
				ipAddress: "192.168.1.1",
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`, "Mozilla/5.0", "10.0.0.1");

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
		});

		it("should validate token when User-Agent changes (logs warning but still valid)", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0 Windows",
				ipAddress: "192.168.1.1",
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000),
				createdAt: new Date(),
			});

			const result = await service.validateToken(
				`${VALID_SERIES}:${VALID_TOKEN}`,
				"Mozilla/5.0 Mac",
				"192.168.1.1",
			);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
		});

		it("should validate token when both IP and User-Agent change", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0 Windows",
				ipAddress: "192.168.1.1",
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000),
				createdAt: new Date(),
			});

			const result = await service.validateToken(
				`${VALID_SERIES}:${VALID_TOKEN}`,
				"Chrome/100.0 Mac",
				"10.0.0.1",
			);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
		});

		it("should not consider IP/UA change when original values are null", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`, "Mozilla/5.0", "192.168.1.1");

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
		});

		it("should use timing-safe comparison for token hash validation", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN),
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(Date.now() - 5 * 60 * 1000),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			expect(result.valid).toBe(true);
			expect(result.userId).toBe(123);
		});
	});

	describe("revokeToken", () => {
		it("should delete the token by series", async () => {
			await service.revokeToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			expect(mockDao.deleteBySeries).toHaveBeenCalledWith(VALID_SERIES);
		});

		it("should handle invalid token format gracefully", async () => {
			await service.revokeToken("invalidtokenwithoutcolon");

			expect(mockDao.deleteBySeries).not.toHaveBeenCalled();
		});
	});

	describe("revokeAllTokensForUser", () => {
		it("should delete all tokens for user", async () => {
			await service.revokeAllTokensForUser(123);

			expect(mockDao.deleteAllForUser).toHaveBeenCalledWith(123);
		});
	});

	describe("cleanupExpiredTokens", () => {
		it("should delete expired tokens and return count", async () => {
			vi.mocked(mockDao.deleteExpired).mockResolvedValue(5);

			const count = await service.cleanupExpiredTokens();

			expect(count).toBe(5);
			expect(mockDao.deleteExpired).toHaveBeenCalled();
		});

		it("should return 0 when no tokens to clean", async () => {
			vi.mocked(mockDao.deleteExpired).mockResolvedValue(0);

			const count = await service.cleanupExpiredTokens();

			expect(count).toBe(0);
		});
	});

	describe("createRememberMeService", () => {
		it("should create a RememberMeService instance", () => {
			const instance = createRememberMeService(mockDao);

			expect(instance).toBeInstanceOf(RememberMeService);
		});
	});

	describe("enforceTokenLimit", () => {
		it("should delete oldest tokens when user exceeds token limit", async () => {
			// Configure a low limit for testing
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_DURATION: "30d",
				REMEMBER_ME_ROTATION: true,
				REMEMBER_ME_MAX_TOKENS_PER_USER: 3,
			} as never);

			const limitedService = new RememberMeService(mockDao);

			// Mock existing tokens at the limit
			const existingTokens = [
				{ series: "oldest", lastUsed: new Date("2024-01-01"), userId: 123 },
				{ series: "middle", lastUsed: new Date("2024-01-15"), userId: 123 },
				{ series: "newest", lastUsed: new Date("2024-01-30"), userId: 123 },
			];
			vi.mocked(mockDao.findByUserId).mockResolvedValue(existingTokens as never);
			vi.mocked(mockDao.createToken).mockResolvedValue({
				series: "new-series",
				userId: 123,
				tokenHash: "hashed",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			await limitedService.createToken(123, "Mozilla/5.0", "192.168.1.1");

			// Should delete the oldest token to make room
			expect(mockDao.deleteBySeries).toHaveBeenCalledWith("oldest");
			expect(mockDao.deleteBySeries).toHaveBeenCalledTimes(1);
		});

		it("should delete multiple old tokens when significantly over limit", async () => {
			// Configure a low limit for testing
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_DURATION: "30d",
				REMEMBER_ME_ROTATION: true,
				REMEMBER_ME_MAX_TOKENS_PER_USER: 2,
			} as never);

			const limitedService = new RememberMeService(mockDao);

			// Mock 4 existing tokens (2 over the limit of 2)
			const existingTokens = [
				{ series: "oldest", lastUsed: new Date("2024-01-01"), userId: 123 },
				{ series: "old", lastUsed: new Date("2024-01-10"), userId: 123 },
				{ series: "newer", lastUsed: new Date("2024-01-20"), userId: 123 },
				{ series: "newest", lastUsed: new Date("2024-01-30"), userId: 123 },
			];
			vi.mocked(mockDao.findByUserId).mockResolvedValue(existingTokens as never);
			vi.mocked(mockDao.createToken).mockResolvedValue({
				series: "new-series",
				userId: 123,
				tokenHash: "hashed",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			await limitedService.createToken(123, "Mozilla/5.0", "192.168.1.1");

			// Should delete the 3 oldest tokens (4 existing - 2 limit + 1 for new = 3 to delete)
			expect(mockDao.deleteBySeries).toHaveBeenCalledWith("oldest");
			expect(mockDao.deleteBySeries).toHaveBeenCalledWith("old");
			expect(mockDao.deleteBySeries).toHaveBeenCalledWith("newer");
			expect(mockDao.deleteBySeries).toHaveBeenCalledTimes(3);
		});

		it("should not delete tokens when under the limit", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_DURATION: "30d",
				REMEMBER_ME_ROTATION: true,
				REMEMBER_ME_MAX_TOKENS_PER_USER: 10,
			} as never);

			const limitedService = new RememberMeService(mockDao);

			// Mock 3 existing tokens (well under limit of 10)
			const existingTokens = [
				{ series: "token1", lastUsed: new Date("2024-01-01"), userId: 123 },
				{ series: "token2", lastUsed: new Date("2024-01-15"), userId: 123 },
				{ series: "token3", lastUsed: new Date("2024-01-30"), userId: 123 },
			];
			vi.mocked(mockDao.findByUserId).mockResolvedValue(existingTokens as never);
			vi.mocked(mockDao.createToken).mockResolvedValue({
				series: "new-series",
				userId: 123,
				tokenHash: "hashed",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			await limitedService.createToken(123, "Mozilla/5.0", "192.168.1.1");

			// Should not delete any tokens
			expect(mockDao.deleteBySeries).not.toHaveBeenCalled();
		});
	});

	describe("isWithinGracePeriod", () => {
		it("should reject previous token when outside grace period", async () => {
			const futureDate = new Date(Date.now() + 86400000);
			// Token was rotated 15 seconds ago (outside the 10s grace period)
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN), // Current token hash
				previousTokenHash: hashToken(VALID_TOKEN_PREV), // Previous token hash
				rotatedAt: new Date(Date.now() - 15000), // Rotated 15 seconds ago (outside 10s grace)
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			// Validate using the PREVIOUS token (should be rejected as theft since outside grace period)
			const result = await service.validateToken(
				`${VALID_SERIES}:${VALID_TOKEN_PREV}`,
				"Mozilla/5.0",
				"192.168.1.1",
			);

			// Outside grace period means previous token is no longer valid -> detected as theft
			expect(result.valid).toBe(false);
			expect(result.possibleTheft).toBe(true);
		});

		it("should return false for grace period when rotatedAt is null despite having previousTokenHash", async () => {
			// This tests an inconsistent state where previousTokenHash exists but rotatedAt is null
			// The code defensively handles this by checking rotatedAt first
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: hashToken(VALID_TOKEN), // Current token hash
				previousTokenHash: hashToken(VALID_TOKEN_PREV), // Previous token hash exists
				rotatedAt: null, // But rotatedAt is null (inconsistent state)
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			// Validate using the PREVIOUS token - should be rejected since grace period is not active (rotatedAt is null)
			const result = await service.validateToken(
				`${VALID_SERIES}:${VALID_TOKEN_PREV}`,
				"Mozilla/5.0",
				"192.168.1.1",
			);

			// Previous token should not be accepted when rotatedAt is null
			expect(result.valid).toBe(false);
			expect(result.possibleTheft).toBe(true);
		});
	});

	describe("compareHashes edge cases", () => {
		it("should safely handle stored hash with different length (corrupted data)", async () => {
			// This tests the defensive check for hash length mismatch
			const futureDate = new Date(Date.now() + 86400000);
			vi.mocked(mockDao.findBySeries).mockResolvedValue({
				series: VALID_SERIES,
				userId: 123,
				tokenHash: "short", // Corrupted/truncated hash (not valid SHA-256 length)
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: futureDate,
				lastUsed: new Date(),
				createdAt: new Date(),
			});

			const result = await service.validateToken(`${VALID_SERIES}:${VALID_TOKEN}`);

			// Should detect as potential theft because hash doesn't match (length mismatch handled safely)
			expect(result.valid).toBe(false);
			expect(result.possibleTheft).toBe(true);
		});
	});
});
